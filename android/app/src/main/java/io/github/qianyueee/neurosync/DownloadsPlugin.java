package io.github.qianyueee.neurosync;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 「ダウンロード」フォルダへの保存（lib/audio-export.ts の downloadBlob から）。
 *
 * WebView は blob: URL の &lt;a download&gt; を保存できない。スマホの Chrome と同じく
 * 端末の「ダウンロード」に置き、終わったら知らせる。JS 側は lib/native/downloads.ts。
 * 10分の WAV は約106MB あり、一度に base64 で渡すと WebView のメモリが持たないので、
 * begin → append（1MB ずつ）→ finish の3段で受け取る。
 *
 * - Android 10+：MediaStore.Downloads（書き終えるまで IS_PENDING で隠す）。権限不要。
 * - Android 9 以前：公開の Download/ に直接書く。WRITE_EXTERNAL_STORAGE が要る
 *   （Chrome もこの版ではダウンロード時に同じ許可を求める）。
 */
@CapacitorPlugin(
    name = "NeuroSyncDownloads",
    permissions = { @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }) }
)
public class DownloadsPlugin extends Plugin {

    private static final class Target {

        OutputStream out;
        Uri uri; // Android 10+
        File file; // Android 9 以前
        String name;
    }

    private final Map<String, Target> open = new ConcurrentHashMap<>();

    @PluginMethod
    public void begin(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }
        beginNow(call);
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") != PermissionState.GRANTED) {
            call.reject("ファイルの保存が許可されませんでした", "PERMISSION_DENIED");
            return;
        }
        beginNow(call);
    }

    private void beginNow(PluginCall call) {
        String filename = sanitize(call.getString("filename", "download"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        Target target = new Target();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                ContentResolver resolver = getContext().getContentResolver();
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    throw new IOException("MediaStore insert failed");
                }
                target.uri = uri;
                target.out = resolver.openOutputStream(uri, "w");
                if (target.out == null) {
                    resolver.delete(uri, null, null);
                    throw new IOException("openOutputStream failed");
                }
                target.name = filename;
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists() && !dir.mkdirs()) {
                    throw new IOException("cannot create " + dir);
                }
                File file = uniqueFile(dir, filename);
                target.file = file;
                target.out = new FileOutputStream(file);
                target.name = file.getName();
            }
        } catch (Exception e) {
            call.reject("保存を始められませんでした", "IO", e);
            return;
        }
        String id = UUID.randomUUID().toString();
        open.put(id, target);
        JSObject ret = new JSObject();
        ret.put("id", id);
        call.resolve(ret);
    }

    @PluginMethod
    public void append(PluginCall call) {
        String id = call.getString("id", "");
        Target target = open.get(id);
        if (target == null) {
            call.reject("unknown download", "NOT_FOUND");
            return;
        }
        try {
            target.out.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {
            open.remove(id);
            discard(target);
            call.reject("書き込みに失敗しました（空き容量を確認してください）", "IO", e);
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        Target target = open.remove(call.getString("id", ""));
        if (target == null) {
            call.reject("unknown download", "NOT_FOUND");
            return;
        }
        try {
            target.out.close();
            if (target.uri != null) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(target.uri, values, null, null);
            } else if (target.file != null) {
                MediaScannerConnection.scanFile(getContext(), new String[] { target.file.getAbsolutePath() }, null, null);
            }
        } catch (Exception e) {
            discard(target);
            call.reject("保存を完了できませんでした", "IO", e);
            return;
        }
        final String name = target.name;
        // 画面の表示言語の言葉が JS から届く（無ければ日本語）。
        final String savedMessage = call.getString("savedMessage", "「ダウンロード」に保存しました：");
        new Handler(Looper.getMainLooper()).post(() ->
            Toast.makeText(getContext(), savedMessage + name, Toast.LENGTH_LONG).show()
        );
        JSObject ret = new JSObject();
        ret.put("name", name);
        call.resolve(ret);
    }

    @PluginMethod
    public void abort(PluginCall call) {
        Target target = open.remove(call.getString("id", ""));
        if (target != null) {
            discard(target);
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        for (Target target : open.values()) {
            discard(target);
        }
        open.clear();
        super.handleOnDestroy();
    }

    private void discard(Target target) {
        try {
            target.out.close();
        } catch (Exception ignored) {
            // 閉じられなくても消す
        }
        if (target.uri != null) {
            try {
                getContext().getContentResolver().delete(target.uri, null, null);
            } catch (RuntimeException ignored) {
                // 失敗の後始末の中で投げると、プラグインの例外としてアプリごと落ちる。
                // 書きかけ（IS_PENDING）は一覧に出ず、端末が後で片付ける。
            }
        } else if (target.file != null) {
            //noinspection ResultOfMethodCallIgnored
            target.file.delete();
        }
    }

    /** ファイル名に使えない文字だけを置き換える（日本語の番組名はそのまま）。 */
    private static String sanitize(String name) {
        String cleaned = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return cleaned.isEmpty() ? "download" : cleaned;
    }

    /** Android 9 以前：同名があれば「名前 (1).拡張子」…にする（MediaStore は自分で付ける）。 */
    private static File uniqueFile(File dir, String filename) {
        File file = new File(dir, filename);
        if (!file.exists()) {
            return file;
        }
        int dot = filename.lastIndexOf('.');
        String base = dot > 0 ? filename.substring(0, dot) : filename;
        String ext = dot > 0 ? filename.substring(dot) : "";
        for (int i = 1; ; i++) {
            File candidate = new File(dir, base + " (" + i + ")" + ext);
            if (!candidate.exists()) {
                return candidate;
            }
        }
    }
}
