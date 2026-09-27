package io.github.qianyueee.neurosync;

import android.graphics.Color;
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
 * バーの下に見えているのは decorView（SystemBars が余白を取っている）なので、
 * その背景色を変え、アイコンの明暗を地色に合わせる。
 *
 * setKeepScreenOn：脳波計と繋がっている間は画面を消さない（消えると WebView が
 * 止まり、測定が途切れる）。
 */
@CapacitorPlugin(name = "NeuroSyncAppChrome")
public class AppChromePlugin extends Plugin {

    @PluginMethod
    public void setSystemBars(PluginCall call) {
        String color = call.getString("color");
        boolean lightBackground = Boolean.TRUE.equals(call.getBoolean("lightBackground", false));
        final int parsed;
        try {
            parsed = Color.parseColor(color);
        } catch (Exception e) {
            call.reject("invalid color: " + color);
            return;
        }
        getActivity()
            .runOnUiThread(() -> {
                Window window = getActivity().getWindow();
                window.getDecorView().setBackgroundColor(parsed);
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                controller.setAppearanceLightStatusBars(lightBackground);
                controller.setAppearanceLightNavigationBars(lightBackground);
                call.resolve();
            });
    }

    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity()
            .runOnUiThread(() -> {
                Window window = getActivity().getWindow();
                if (on) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
                call.resolve();
            });
    }
}
