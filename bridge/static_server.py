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
"""

import os
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

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


class _Handler(SimpleHTTPRequestHandler):
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
