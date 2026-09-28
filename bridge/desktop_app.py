"""NeuroSync Windows アプリ（完全版）— エントリポイント。

Web 版と同じ画面一式（ホーム・Sync Session・Sync Brain・Report・History・設定）を
WebView2 で開く。記録はログインしたアカウントで Web・Android と揃う。Web 版との
違いは Sync Brain だけで、BrainLink Pro（Bluetooth SPP＝OS でペアリングすると
シリアルポートに見える）を PC 単体で読み取る——PC ブリッジもペアリングコードも
要らない。クラウド同時配信（既定 OFF）をオンにすると、スマホ／Web の /brain が
従来どおりペアリングコードで同じ測定を観られる。

画面のビルドは `pnpm build:desktop`（NEXT_PUBLIC_APP_PLATFORM=desktop＝lib/platform.ts の
IS_DESKTOP_APP）。音源は同梱せず Web 版（GitHub Pages）から取る。

構成（1 プロセス 3 スレッド）:
- メインスレッド: pywebview（WebView2）ウィンドウ。webview.start はメイン必須。
- HTTP スレッド:  bridge/web/（Next.js 静的書き出し）を 127.0.0.1:17860 で配信。
- asyncio スレッド: WS サーバ（サンプル + 制御）と測定パイプライン。

使い方:
    python desktop_app.py                # ウィンドウ起動（Windows・要 pywebview）
    python desktop_app.py --no-window    # サーバのみ（開発・検証用。
                                         # `NEXT_PUBLIC_APP_PLATFORM=desktop pnpm dev` の
                                         # http://localhost:3000/ から繋ぐ）
    python desktop_app.py --no-window --demo   # 実機なしの合成データで一式確認

変えてはいけないもの（変えると、この PC に残る記録・ログインが見えなくなる）：
- HTTP のポート 17860（localStorage はポートまで含めた origin ごと）
- WebView2 のプロファイルの場所＝exe と同じフォルダの profile/。exe の名前は
  NeuroSyncMeasure.exe から NeuroSync.exe に変わったので、新しい exe は古い exe と
  同じフォルダに置く（bridge/README.md）
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

WINDOW_TITLE = "NeuroSync"
WEBVIEW2_URL = "https://developer.microsoft.com/microsoft-edge/webview2/"


# WebView2 ランタイムの登録キー（Microsoft の手引きどおり、各チャネルの pv を見る）。
_WEBVIEW2_CLIENTS = (
    "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",  # Evergreen Runtime
    "{2CD8A007-E189-409D-A2C8-9AF4EF3C72AA}",  # Beta
    "{0D50BFEC-CD6A-4F9A-964C-C7416E3ACB10}",  # Dev
    "{65C35B14-6C1D-4122-AC46-7148CC9D6497}",  # Canary
)


def _webview2_installed() -> bool:
    """WebView2 ランタイムが入っているか（Windows 以外・判定できないときは True）。

    pywebview は WebView2 が見つからないと黙って旧い IE（MSHTML）に切り替える——
    その中ではこの画面は動かず、真っ白なウィンドウになるだけなので、先に確かめる。
    """
    if sys.platform != "win32":
        return True
    try:
        import winreg
    except ImportError:
        return True
    places = (
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\EdgeUpdate\Clients"),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\EdgeUpdate\Clients"),
    )
    for hive, base in places:
        for client in _WEBVIEW2_CLIENTS:
            try:
                with winreg.OpenKey(hive, f"{base}\\{client}") as key:
                    version, _ = winreg.QueryValueEx(key, "pv")
            except OSError:
                continue
            if version and str(version) != "0.0.0.0":
                return True
    return False


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
        self.srv: local_server.LocalServer | None = None
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
        bridge = DesktopBridge(self.saved, http_port=self.args.http_port)
        srv, server, actual = await local_server.start(bridge, self.args.ws_port)
        bridge.emitter = srv.emit
        self.srv = srv
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

    def relay_auth(self, event: dict) -> bool:
        """HTTP スレッド（/auth/callback）から呼ばれる：Google ログインの戻りを WS の
        ループへ渡し、画面に届いたかを返す（届かなければブラウザにそう表示する）。"""
        if self.loop is None or self.srv is None:
            return False
        try:
            fut = asyncio.run_coroutine_threadsafe(self.srv.relay_auth(event), self.loop)
            return bool(fut.result(timeout=3))
        except Exception:  # noqa: BLE001 — 失敗はブラウザ側の案内に回す
            return False


def main() -> None:
    _setup_logging()
    saved = desktop_config.load()

    parser = argparse.ArgumentParser(description="NeuroSync Windows アプリ")
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
            f"ポート {args.http_port} を開けません。すでに {WINDOW_TITLE}（または旧い NeuroSync 測定）が"
            f"起動していないか確認してください。\n（2つ同時に起動すると BrainLink のポートも取り合いに"
            f"なります）\n\n{e}"
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

    # Google ログインの戻り（/auth/callback）を画面へ渡す口。HTTP は Runtime より先に
    # 立っているので、ここで後から繋ぐ（それまでの戻りは「画面が見つからない」扱い）。
    static_server.set_auth_callback_sink(rt.relay_auth)

    # 最初に開くのはホーム。`?ws=` はこのページだけに付き、画面が sessionStorage に
    # 控えて以後も同じポートへ繋ぐ（lib/mind/desktop-bridge.ts）。
    url = f"http://127.0.0.1:{args.http_port}/?ws={rt.ws_port}"

    if args.no_window:
        log.info("--no-window: %s をブラウザで開いてください（終了は Ctrl+C）", url)
        try:
            while thread.is_alive():
                thread.join(1)
        except KeyboardInterrupt:
            rt.request_stop()
            thread.join(5)
        return

    if not _webview2_installed():
        _fatal(
            "画面の表示に Microsoft Edge WebView2 ランタイムが必要です。\n"
            f"インストールしてから、もう一度起動してください:\n{WEBVIEW2_URL}"
        )
        rt.request_stop()
        sys.exit(1)

    # WebView2（Chromium）への起動オプション。環境変数は pywebview が CreationProperties に
    # 入れる既定（--disable-features=ElasticOverscroll）を置き換えうるので、その既定も
    # ここに含め直す。
    # - autoplay：10秒チェックのチャイムが自動再生ポリシーに飲まれないように
    # - バックグラウンドでの間引きを止める：最小化・ほかのウィンドウの陰でも、
    #   測定の記録と再生のタイマーを止めない
    # - HardwareMediaKeyHandling：キーボードのメディアキー・Windows のメディア操作
    #   （WebView2 では既定で無効。効かない環境があっても害は無い）
    os.environ.setdefault(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        " ".join(
            [
                "--autoplay-policy=no-user-gesture-required",
                "--disable-features=ElasticOverscroll,CalculateNativeWinOcclusion",
                "--enable-features=HardwareMediaKeyHandling",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
            ]
        ),
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
        # md ブレークポイント（768px）以上を確保して、Web 版のデスクトップ表示
        # （左のメニュー＋2列）にする。Sync Brain の 2×2 グリッド（マインドマップ／
        # 脳波バランス／ブレインアート／推移）も1画面に収まる。
        width=1160,
        height=860,
        min_size=(820, 640),
        # Web 版と同じく、本文は選んでコピーでき、拡大もできる（50〜60代の利用者の
        # 逃げ道。pywebview の既定はどちらも禁止）。
        text_select=True,
        zoomable=True,
    )
    # target=_blank のリンクと window.open は既定のブラウザで開く（pywebview の既定値
    # だが、明示しておく）：Google ログインと「Web版で記録を見る」がこれに頼る——
    # Google は WebView 内でのログインを拒むので、ブラウザ側で済ませる必要がある。
    try:
        webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
        # 音源の書き出し（WAV / MP3）を保存できるように。保存のたびに「名前を付けて
        # 保存」が開く（既定の保存先は「ダウンロード」）。
        webview.settings["ALLOW_DOWNLOADS"] = True
    except Exception:  # noqa: BLE001 — 設定辞書の無い古い pywebview でも起動は続ける
        pass
    try:
        # private_mode=False + storage_path は必須：既定のプライベートモードだと
        # localStorage（測定記録・測定者・チェック履歴・ログイン状態）が終了のたびに消える。
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
