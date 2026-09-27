"""同梱した Next.js 静的書き出し（bridge/web/）を 127.0.0.1 に配信する。

stdlib の http.server を使う（websockets の process_request ではなく）：
MIME タイプ・HEAD・404 をそのまま貰える上、websockets 側の HTTP フックは
バージョン間で署名が変わっていて（依存版は realtime が握っていて選べない）、
静的配信まで巻き込みたくない。それにファイル読みを WS のイベントループに
乗せない。

Next の書き出しは trailingSlash なしだと /desktop → desktop.html という
「拡張子なしパス → .html」形。しかも同名の desktop/ ディレクトリ（RSC ペイロード
の .txt 置き場）も並んで出るので、「パスが存在しなければ .html」では足りない
——ディレクトリが素通しされて 301 → 中身一覧になる。拡張子なしパスは
（index.html を持つ本物のディレクトリでない限り）.html 同名ファイルを優先する。

/auth/callback だけは静的ファイルではなくここで答える：Google ログインを既定の
ブラウザで済ませたあと、Supabase がそのブラウザをここへ戻す（?code=…）。code を
set_auth_callback_sink で受け取った関数（desktop_app → WS → 画面）へ渡し、
ブラウザには「アプリに戻ってください」だけを返す。Next のページを返さないのは、
ブラウザ側で supabase-js が起動してセッションを持ってしまう（トークンの取り合いに
なる）のを避けるため。クエリ（code）はログに残さない。
"""

import html
import os
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable, Optional
from urllib.parse import parse_qs, urlsplit

from config import app_dir


def web_root() -> str:
    """凍結時は exe に同梱した web/、ソース実行時はリポジトリの out/。"""
    if getattr(sys, "frozen", False):
        bundled = os.path.join(getattr(sys, "_MEIPASS", ""), "web")
        if os.path.isdir(bundled):
            return bundled
        # onedir ビルドや手展開のときは exe の隣を見る。
        return os.path.join(app_dir(), "web")
    return os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out")
    )


AUTH_CALLBACK_PATH = "/auth/callback"

# auth_callback のイベント（dict）を画面へ渡し、届いたかを返す関数。
_auth_sink: Optional[Callable[[dict], bool]] = None


def set_auth_callback_sink(fn: Optional[Callable[[dict], bool]]) -> None:
    global _auth_sink
    _auth_sink = fn


def _page(title: str, body: str, detail: str = "") -> bytes:
    extra = f'<p class="detail">{html.escape(detail)}</p>' if detail else ""
    return f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} — NeuroSync 測定</title>
<style>
  body {{ margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#1E1B4B; color:#e8e4f8; font-family:"Hiragino Sans","Meiryo",sans-serif; }}
  main {{ max-width:560px; padding:32px 24px; text-align:center; }}
  h1 {{ font-size:22px; margin:0 0 16px; }}
  p {{ font-size:16px; line-height:1.8; margin:0 0 12px; color:#d0caef; }}
  .detail {{ font-size:13px; color:#a8a0d0; word-break:break-all; }}
</style></head>
<body><main><h1>{html.escape(title)}</h1><p>{html.escape(body)}</p>{extra}</main></body></html>
""".encode("utf-8")


class _Handler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 — 基底の名前
        parts = urlsplit(self.path)
        if parts.path == AUTH_CALLBACK_PATH:
            self._auth_callback(parse_qs(parts.query))
            return
        super().do_GET()

    def _auth_callback(self, query: dict) -> None:
        def first(key: str) -> str:
            values = query.get(key) or [""]
            return values[0]

        code = first("code")
        if code:
            event: dict = {"type": "auth_callback", "code": code}
        else:
            event = {"type": "auth_callback", "error": first("error") or "missing_code"}
            if first("error_code"):
                event["errorCode"] = first("error_code")
            if first("error_description"):
                event["description"] = first("error_description")

        delivered = False
        if _auth_sink is not None:
            try:
                delivered = bool(_auth_sink(event))
            except Exception:  # noqa: BLE001 — ブラウザには必ず答える
                delivered = False

        if code and delivered:
            body = _page(
                "ログインが完了しました",
                "このタブを閉じて、NeuroSync 測定アプリの画面に戻ってください。",
            )
        elif code:
            # 画面が再接続すれば 2 分以内は届く（local_server.AUTH_RETAIN_SEC）ので、
            # 「失敗」とは言い切らない。
            body = _page(
                "アプリの画面に戻ってください",
                "測定アプリの画面とまだつながっていません。アプリに戻ってログインできていなければ、"
                "「Googleでログイン」からもう一度お試しください。",
            )
        else:
            body = _page(
                "ログインできませんでした",
                "NeuroSync 測定アプリの画面に戻って、もう一度お試しください。",
                event.get("description", ""),
            )
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    def translate_path(self, path: str) -> str:
        resolved = super().translate_path(path)
        if not os.path.splitext(resolved)[1]:
            candidate = resolved.rstrip("/\\") + ".html"
            has_index = os.path.isfile(os.path.join(resolved, "index.html"))
            if os.path.isfile(candidate) and not has_index:
                return candidate
        return resolved

    def list_directory(self, path: str):
        # アプリ配信サーバにディレクトリ一覧は要らない（ローカル限定とはいえ）。
        self.send_error(404, "Not Found")
        return None

    def log_message(self, format: str, *args) -> None:  # noqa: A002 — 基底の署名
        # アクセスログでコンソール/ログファイルを埋めない（1Hz で .txt を引く）。
        pass


def start(port: int, directory: str) -> ThreadingHTTPServer:
    """127.0.0.1:port で配信を開始する（デーモンスレッド）。

    ポートが塞がっているときの OSError はそのまま投げる——既に別インスタンスが
    動いている合図で、呼び出し側（desktop_app）がダイアログを出して終了する。
    """
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(_Handler, directory=directory))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
