"""NeuroSync デスクトップ測定アプリ — エントリポイント。

BrainLink Pro（Bluetooth SPP＝OS でペアリングするとシリアルポートに見える）を
PC 単体で読み取り、Sync Brain と同じ画面でリアルタイム表示・測定・ローカル保存
する。クラウドはオプション（クラウド同時配信、既定 OFF）——オンにするとスマホ／
Web の /brain が従来どおりペアリングコードで同じ測定を観られる。

構成（1 プロセス 3 スレッド）:
- メインスレッド: pywebview（WebView2）ウィンドウ。webview.start はメイン必須。
- HTTP スレッド:  bridge/web/（Next.js 静的書き出し）を 127.0.0.1:17860 で配信。
- asyncio スレッド: WS サーバ（サンプル + 制御）と測定パイプライン。

使い方:
    python desktop_app.py                # ウィンドウ起動（Windows・要 pywebview）
    python desktop_app.py --no-window    # サーバのみ（開発・検証用。`pnpm dev` の
                                         # http://localhost:3000/desktop から繋ぐ）
    python desktop_app.py --no-window --demo   # 実機なしの合成データで一式確認
"""

import argparse
import asyncio
import logging
import os
import sys
import threading

import desktop_config
import local_server
import static_server
from config import app_dir
from desktop_bridge import DesktopBridge

log = logging.getLogger("neurosync")

WINDOW_TITLE = "NeuroSync 測定"
WEBVIEW2_URL = "https://developer.microsoft.com/microsoft-edge/webview2/"


def _setup_logging() -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    try:
        from logging.handlers import RotatingFileHandler

        handlers.append(
            RotatingFileHandler(
                os.path.join(app_dir(), "neurosync_desktop.log"),
                maxBytes=1_000_000,
                backupCount=2,
                encoding="utf-8",
            )
        )
    except Exception:  # noqa: BLE001 — 読み取り専用フォルダでもコンソールで動く
        pass
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(name)s %(message)s", handlers=handlers
    )


def _fatal(msg: str) -> None:
    """ログ + （Windows の windowed exe には コンソールが無いので）ダイアログ。"""
    log.error(msg)
    if sys.platform == "win32":
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(None, msg, WINDOW_TITLE, 0x10)  # MB_ICONERROR
        except Exception:  # noqa: BLE001
            pass


class Runtime:
    """asyncio スレッド。起動完了（実 WS ポート確定）を ready で主スレッドへ返す。"""

    def __init__(self, args: argparse.Namespace, saved: dict) -> None:
        self.args = args
        self.saved = saved
        self.loop: asyncio.AbstractEventLoop | None = None
        self.ws_port: int | None = None
        self.ready = threading.Event()
        self.error: BaseException | None = None
        self._stop: asyncio.Event | None = None

    def run(self) -> None:
        try:
            asyncio.run(self._main())
        except BaseException as e:  # noqa: BLE001 — 起動失敗を主スレッドへ運ぶ
            self.error = e
        finally:
            self.ready.set()

    async def _main(self) -> None:
        self.loop = asyncio.get_running_loop()
        self._stop = asyncio.Event()
        bridge = DesktopBridge(self.saved)
        srv, server, actual = await local_server.start(bridge, self.args.ws_port)
        bridge.emitter = srv.emit
        self.ws_port = actual
        log.info("WS:   ws://127.0.0.1:%d", actual)
        self.ready.set()
        if self.args.demo:
            await bridge.start_demo()
        try:
            await self._stop.wait()
        finally:
            await bridge.shutdown()
            server.close()
            await server.wait_closed()

    def request_stop(self) -> None:
        if self.loop is not None and self._stop is not None:
            self.loop.call_soon_threadsafe(self._stop.set)


def main() -> None:
    _setup_logging()
    saved = desktop_config.load()

    parser = argparse.ArgumentParser(description="NeuroSync デスクトップ測定アプリ")
    parser.add_argument(
        "--no-window", action="store_true", help="ウィンドウを開かずサーバのみ起動（開発・検証用）"
    )
    parser.add_argument(
        "--demo", action="store_true", help="起動時から合成データを流す（実機不要）"
    )
    parser.add_argument(
        "--http-port",
        type=int,
        default=desktop_config.port_of(saved, "http_port", desktop_config.DEFAULT_HTTP_PORT),
    )
    parser.add_argument(
        "--ws-port",
        type=int,
        default=desktop_config.port_of(saved, "ws_port", desktop_config.DEFAULT_WS_PORT),
    )
    args = parser.parse_args()

    web_dir = static_server.web_root()
    if not os.path.isdir(web_dir):
        # --no-window + `pnpm dev` の開発フローでは同梱 UI 無しでも困らない。
        log.warning("静的ファイルがありません（%s）— `pnpm build:desktop` で生成されます", web_dir)

    try:
        static_server.start(args.http_port, web_dir)
    except OSError as e:
        _fatal(
            f"ポート {args.http_port} を開けません。すでに {WINDOW_TITLE} が起動していないか"
            f"確認してください。\n（2つ同時に起動すると BrainLink のポートも取り合いになります）\n\n{e}"
        )
        sys.exit(1)
    log.info("HTTP: http://127.0.0.1:%d/  (root: %s)", args.http_port, web_dir)

    rt = Runtime(args, saved)
    thread = threading.Thread(target=rt.run, daemon=True)
    thread.start()
    rt.ready.wait(15)
    if rt.error is not None or rt.ws_port is None:
        _fatal(f"サーバの起動に失敗しました: {rt.error}")
        sys.exit(1)

    url = f"http://127.0.0.1:{args.http_port}/desktop?ws={rt.ws_port}"

    if args.no_window:
        log.info("--no-window: %s をブラウザで開いてください（終了は Ctrl+C）", url)
        try:
            while thread.is_alive():
                thread.join(1)
        except KeyboardInterrupt:
            rt.request_stop()
            thread.join(5)
        return

    # 10秒チェックのチャイムが自動再生ポリシーに飲まれないように。
    os.environ.setdefault(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--autoplay-policy=no-user-gesture-required"
    )
    try:
        import webview  # 遅延 import — --no-window は pywebview 無しの環境でも動く
    except ImportError:
        _fatal(
            "pywebview がインストールされていません。\n"
            "pip install -r requirements-desktop.txt を実行してください。"
        )
        rt.request_stop()
        sys.exit(1)

    webview.create_window(
        WINDOW_TITLE,
        url,
        # md ブレークポイント（768px）以上を確保して 2×2 グリッド（マインドマップ／
        # 脳波バランス／ブレインアート／推移）を1画面に収める。480 幅だと測定中に
        # スクロールが要る。
        width=1160,
        height=860,
        min_size=(820, 640),
    )
    try:
        # private_mode=False + storage_path は必須：既定のプライベートモードだと
        # localStorage（測定記録・測定者・チェック履歴）が終了のたびに消える。
        webview.start(private_mode=False, storage_path=os.path.join(app_dir(), "profile"))
    except Exception as e:  # noqa: BLE001 — WebView2 ランタイム欠如が典型
        _fatal(
            "画面の表示に失敗しました。Microsoft Edge WebView2 ランタイムが必要です。\n"
            f"インストール: {WEBVIEW2_URL}\n\n詳細: {e}"
        )
        rt.request_stop()
        sys.exit(1)

    # webview.start はウィンドウが全て閉じると戻る。
    rt.request_stop()
    thread.join(5)


if __name__ == "__main__":
    main()
