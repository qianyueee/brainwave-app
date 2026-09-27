package io.github.qianyueee.neurosync;

import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * NeuroSync の Android アプリ本体。中身は Web 版と同じ静的書き出し（android-web/ →
 * assets/public）で、ここでやるのは「WebView をスマホの Chrome と同じに振る舞わせる」
 * ための数か所だけ:
 * - 本リポジトリ内のプラグイン（システムバー・後台再生・BrainLink）の登録
 * - /brain などを読み直したときに brain.html を返す（ExportRouteWebViewClient）
 * - 端末の文字サイズ設定に追従する（Chrome と同じ。WebView の既定は 100% 固定）
 * - 画面が見えていなくてもレンダラの優先度を落とさない（後台再生中に落とされない）
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // プラグインは super.onCreate（＝Bridge の生成）より前に登録する。
        registerPlugin(AppChromePlugin.class);
        registerPlugin(NowPlayingPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) {
            // WebView が入っていない端末（BridgeActivity が no_webview 画面を出す）。
            return;
        }
        bridge.setWebViewClient(new ExportRouteWebViewClient(bridge));
        applyTextZoom(getResources().getConfiguration());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            bridge.getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
    }

    /**
     * 文字サイズの変更は AndroidManifest の configChanges に fontScale を入れて
     * ここで受ける——Activity を作り直すと WebView ごと再読み込みになり、再生中の
     * セッションが止まる。
     */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyTextZoom(newConfig);
    }

    private void applyTextZoom(Configuration config) {
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }
        bridge.getWebView().getSettings().setTextZoom(Math.round(config.fontScale * 100f));
    }
}
