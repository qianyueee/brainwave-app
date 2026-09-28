package io.github.qianyueee.neurosync;

import android.app.AlertDialog;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebView;
import android.widget.EditText;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * window.alert / confirm / prompt のダイアログ。Capacitor の既定はボタンが英語の
 * 「OK」「Cancel」固定だが、スマホの Chrome は端末の言語（日本語なら「キャンセル」）で
 * 出す。記録の削除確認（ヒストリー・レポート・設定など）で使っているので、ボタンを
 * 端末の言語の標準文言（android.R.string.ok / cancel）にする。ほかの振る舞い
 * （ファイル選択・権限など）は Capacitor のまま。
 *
 * 親のコンストラクタが ActivityResult の登録をするので、Activity の onCreate の中で
 * 作ること（MainActivity）。
 */
public class LocalizedChromeClient extends BridgeWebChromeClient {

    private final Bridge bridge;

    public LocalizedChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
        if (bridge.getActivity().isFinishing()) {
            return true;
        }
        new AlertDialog.Builder(view.getContext())
            .setMessage(message)
            .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
            .setOnCancelListener((dialog) -> result.cancel())
            .show();
        return true;
    }

    @Override
    public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
        if (bridge.getActivity().isFinishing()) {
            return true;
        }
        new AlertDialog.Builder(view.getContext())
            .setMessage(message)
            .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
            .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
            .setOnCancelListener((dialog) -> result.cancel())
            .show();
        return true;
    }

    @Override
    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, final JsPromptResult result) {
        if (bridge.getActivity().isFinishing()) {
            return true;
        }
        final EditText input = new EditText(view.getContext());
        if (defaultValue != null) {
            input.setText(defaultValue);
        }
        new AlertDialog.Builder(view.getContext())
            .setMessage(message)
            .setView(input)
            .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm(input.getText().toString()))
            .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
            .setOnCancelListener((dialog) -> result.cancel())
            .show();
        return true;
    }
}
