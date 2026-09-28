package io.github.qianyueee.neurosync;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * アプリの「枠」（システムバーの色・画面の常時点灯）。JS 側は lib/native/app-chrome.ts。
 *
 * setSystemBars：Web 版では lib/theme.ts が &lt;meta name="theme-color"&gt; を時間帯の
 * パレット（palette.navy）に書き換え、スマホの Chrome はその色でステータスバーを
 * 塗る。WebView はこのメタを見ないので、同じ色をここで受け取って塗る。
 * - Android 15+（edge-to-edge）：バーは透明で、下に見えるのは SystemBars が余白を
 *   取った decorView。その背景色を変える。
 * - Android 14 以前：バーは自前の色を持つので window のバーの色も変える。
 * - アイコンの明暗は地色に合わせる。
 * Capacitor の SystemBars は起動時と構成変更（回転・ダークモード・文字サイズ）の
 * たびに、これらをテーマの既定に戻す。最後に受け取った色を覚えておき、戻された
 * 直後に塗り直す。
 *
 * setKeepScreenOn：脳波計と繋がっている間は画面を消さない（消えると WebView が
 * 止まり、測定が途切れる）。
 */
@CapacitorPlugin(name = "NeuroSyncAppChrome")
public class AppChromePlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());
    private Integer barColor = null;
    private boolean lightBackground = false;

    @PluginMethod
    public void setSystemBars(PluginCall call) {
        String color = call.getString("color");
        final int parsed;
        try {
            parsed = Color.parseColor(color);
        } catch (Exception e) {
            call.reject("invalid color: " + color);
            return;
        }
        boolean light = Boolean.TRUE.equals(call.getBoolean("lightBackground", false));
        main.post(() -> {
            barColor = parsed;
            lightBackground = light;
            applySystemBars();
            call.resolve();
        });
    }

    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        main.post(() -> {
            Window window = getActivity().getWindow();
            if (on) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        // SystemBars も同じ通知で既定色に戻す。全プラグインが処理し終えた後に塗り直す。
        main.post(this::applySystemBars);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        main.post(this::applySystemBars);
    }

    @SuppressWarnings("deprecation")
    private void applySystemBars() {
        if (barColor == null || getActivity() == null) {
            return;
        }
        Window window = getActivity().getWindow();
        window.getDecorView().setBackgroundColor(barColor);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            window.setStatusBarColor(barColor);
            window.setNavigationBarColor(barColor);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(lightBackground);
        controller.setAppearanceLightNavigationBars(lightBackground);
    }
}
