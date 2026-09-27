package io.github.qianyueee.neurosync;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 静的書き出し（next.config.ts：output "export"、trailingSlash なし）は /brain を
 * brain.html として書き出す。一方 Capacitor の端末内サーバは、拡張子の無いパスを
 * 一律 index.html（＝ホーム）で答える（WebViewLocalServer の html5mode）。
 * そのままだと /brain を読み直した・Next.js が通常遷移に切り替えた、といった
 * 「ページ丸ごとの読み込み」でホームが描かれてしまう。
 *
 * そこでメインフレームの要求だけ、assets/public/&lt;path&gt;.html があればその URL に
 * 言い換えてから Capacitor に渡す（JS の注入・MIME・ヘッダは Capacitor のまま）。
 * アドレスは /brain のままなので、Next.js のルーターから見ても通常どおり。
 * bridge/static_server.py（デスクトップ測定アプリ）の「拡張子なし→同名 .html を
 * 優先」と同じ規則。
 */
public class ExportRouteWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;
    private final AssetManager assets;
    private final Map<String, Boolean> htmlExists = new ConcurrentHashMap<>();

    public ExportRouteWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        this.assets = bridge.getContext().getAssets();
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceRequest routed = routeToExportedHtml(request);
        return super.shouldInterceptRequest(view, routed != null ? routed : request);
    }

    private WebResourceRequest routeToExportedHtml(WebResourceRequest request) {
        if (!request.isForMainFrame() || !"GET".equalsIgnoreCase(request.getMethod())) {
            return null;
        }
        Uri url = request.getUrl();
        if (url.getHost() == null || !url.getHost().equalsIgnoreCase(bridge.getHost())) {
            return null;
        }
        String path = url.getPath();
        if (path == null || path.equals("/")) {
            return null;
        }
        String trimmed = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
        String last = trimmed.substring(trimmed.lastIndexOf('/') + 1);
        if (last.isEmpty() || last.contains(".")) {
            return null;
        }
        String asset = Bridge.DEFAULT_WEB_ASSET_DIR + trimmed + ".html";
        if (!assetExists(asset)) {
            return null;
        }
        Uri html = url.buildUpon().path(trimmed + ".html").build();
        return new RoutedRequest(request, html);
    }

    private boolean assetExists(String asset) {
        Boolean cached = htmlExists.get(asset);
        if (cached != null) {
            return cached;
        }
        boolean exists;
        try (InputStream ignored = assets.open(asset)) {
            exists = true;
        } catch (IOException e) {
            exists = false;
        }
        htmlExists.put(asset, exists);
        return exists;
    }

    /** URL だけを差し替えた要求（それ以外は元の要求のまま）。 */
    private static final class RoutedRequest implements WebResourceRequest {

        private final WebResourceRequest original;
        private final Uri url;

        RoutedRequest(WebResourceRequest original, Uri url) {
            this.original = original;
            this.url = url;
        }

        @Override
        public Uri getUrl() {
            return url;
        }

        @Override
        public boolean isForMainFrame() {
            return original.isForMainFrame();
        }

        @Override
        public boolean isRedirect() {
            return original.isRedirect();
        }

        @Override
        public boolean hasGesture() {
            return original.hasGesture();
        }

        @Override
        public String getMethod() {
            return original.getMethod();
        }

        @Override
        public Map<String, String> getRequestHeaders() {
            return original.getRequestHeaders();
        }
    }
}
