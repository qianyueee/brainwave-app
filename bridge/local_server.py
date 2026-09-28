"""ローカル WebSocket サーバ：サンプル配信 + 接続ダイアログの制御チャネル。

1 本のソケットに両方を乗せる——制御（ポート一覧・クラウド状態）はサンプルが
流れ出す前から要るので、接続状態を 1 つにまとめた方が web 側が単純になる。

プロトコル（lib/mind/desktop-bridge.ts と対で保つ）:
  server→client  {"type":"state","state":{...}}   接続時・変化時・毎コマンド後の全量
                 {"type":"sample","sample":{...}}  EegSample そのまま（1Hz）
                 {"type":"log","msg":"...","msgEn":"..."}  msgEn は英語の画面用（無い古い版もある）
                 {"type":"auth_callback","code":"..."}  Google ログインの戻り
                 {"type":"auth_callback","error":"...","errorCode":"...","description":"..."}
  client→server  {"type":"scan"} / {"type":"connect","port":"COM3"} /
                 {"type":"disconnect"} / {"type":"demo","on":bool} /
                 {"type":"cloud","on":bool,"code":"AB23-CD45"}
コマンドに個別 ack は無く、必ず state 全量で答える（冪等・順序に依らない）。

auth_callback：画面（WebView）内では Google がログインを拒むので、ログインは既定の
ブラウザで行い、Supabase から http://127.0.0.1:{HTTP}/auth/callback?code=… へ戻って
くる（static_server が受ける。戻り先 URL は state.authCallbackUrl）。その code を
ここで画面へ渡し、画面が PKCE の verifier と引き換えにセッションを得る
（lib/mind/desktop-google-auth.ts）。code 単体では何もできない（verifier は画面の
中にしか無い）。画面が一瞬切れていても届くよう、直近の1件は AUTH_RETAIN_SEC 秒
取っておき、その間に繋がったクライアントにも送る。

接続できるのはローカルのページだけ（Origin が 127.0.0.1 / localhost、または
Origin を付けないブラウザ以外のプログラム）。ブラウザは任意のサイトから
ws://127.0.0.1 に繋げてしまうので、よそのサイトに脳波の流れや操作を渡さない。

websockets のバージョンは realtime（supabase 依存）が握っていて選べないため、
新旧どちらの API でも動く書き方に限定する：serve の二段 import・1 引数
ハンドラ・broadcast() ヘルパ不使用（配置がバージョン間で移動した）。
"""

import asyncio
import json
import logging
import re
import time

try:
    from websockets.asyncio.server import serve as ws_serve  # websockets >= 13
except ImportError:
    from websockets.server import serve as ws_serve  # type: ignore[no-redef]

from desktop_bridge import DesktopBridge

log = logging.getLogger("neurosync.ws")

# Google ログインの戻り（auth_callback）を取っておく秒数。
AUTH_RETAIN_SEC = 120

_LOCAL_ORIGIN = re.compile(r"^http://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$")


def _origin_of(ws) -> "str | None":
    """ハンドシェイクの Origin ヘッダ（websockets の新旧 API どちらでも）。"""
    request = getattr(ws, "request", None)  # websockets >= 13（asyncio 実装）
    headers = getattr(request, "headers", None) if request is not None else None
    if headers is None:
        headers = getattr(ws, "request_headers", None)  # 旧実装
    return headers.get("Origin") if headers is not None else None


def origin_allowed(origin: "str | None") -> bool:
    """ブラウザは必ず Origin を付ける。付いていないのは同じ PC のブラウザ以外の
    プログラム（検証用クライアント等）なので通す。"""
    return origin is None or bool(_LOCAL_ORIGIN.match(origin))


class LocalServer:
    def __init__(self, bridge: DesktopBridge) -> None:
        self.bridge = bridge
        self.clients: set = set()
        self._auth_event: "dict | None" = None
        self._auth_at = 0.0

    async def emit(self, event: dict) -> None:
        """DesktopBridge.emitter として配線される。"""
        await self._send_all(event)

    async def _send_all(self, event: dict) -> int:
        """全クライアントへ送り、送れた数を返す。"""
        if not self.clients:
            return 0
        msg = json.dumps(event, ensure_ascii=False)
        sent = 0
        for ws in list(self.clients):
            try:
                await ws.send(msg)
                sent += 1
            except Exception:  # noqa: BLE001 — 切れた 1 クライアントで全体を止めない
                self.clients.discard(ws)
        return sent

    async def relay_auth(self, event: dict) -> bool:
        """Google ログインの戻りを画面へ渡す（static_server → desktop_app 経由）。
        誰かに送れたら True。"""
        self._auth_event = event
        self._auth_at = time.monotonic()
        return await self._send_all(event) > 0

    async def handler(self, ws) -> None:
        if not origin_allowed(_origin_of(ws)):
            log.warning("ローカル以外のページからの接続を拒否しました")
            await ws.close(code=1008, reason="origin not allowed")
            return
        self.clients.add(ws)
        try:
            await ws.send(
                json.dumps({"type": "state", "state": self.bridge.state()}, ensure_ascii=False)
            )
            # 画面が再接続している最中に戻ってきたログインも取りこぼさない。
            if (
                self._auth_event is not None
                and time.monotonic() - self._auth_at < AUTH_RETAIN_SEC
            ):
                await ws.send(json.dumps(self._auth_event, ensure_ascii=False))
            async for raw in ws:
                try:
                    cmd = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(cmd, dict):
                    await self._dispatch(cmd)
        except Exception:  # noqa: BLE001 — 接続断は正常系
            pass
        finally:
            self.clients.discard(ws)

    async def _dispatch(self, cmd: dict) -> None:
        t = cmd.get("type")
        b = self.bridge
        if t == "scan":
            b.refresh_ports()
        elif t == "connect":
            port = str(cmd.get("port") or "").strip()
            if port:
                await b.start_serial(port)
            else:
                await b.emit_log("ポートを選択してください", "Please choose a port")
        elif t == "disconnect":
            await b.stop_pipeline()
        elif t == "demo":
            if cmd.get("on"):
                await b.start_demo()
            else:
                await b.stop_pipeline()
        elif t == "cloud":
            code = cmd.get("code")
            await b.set_cloud(bool(cmd.get("on")), code if isinstance(code, str) else None)
        else:
            await b.emit_log(f"未知のコマンド: {t}", f"Unknown command: {t}")
        await self.emit({"type": "state", "state": b.state()})


async def start(bridge: DesktopBridge, port: int):
    """WS サーバを起動して (LocalServer, server, 実ポート) を返す。

    希望ポートが塞がっていたら空きポートに落とす——実ポートはページ URL の
    ?ws= で伝わるので WS 側は固定でなくてよい（固定必須なのは HTTP だけ）。
    """
    srv = LocalServer(bridge)
    try:
        server = await ws_serve(srv.handler, "127.0.0.1", port)
        actual = port
    except OSError:
        log.warning("WS ポート %d が使用中のため空きポートで起動します", port)
        server = await ws_serve(srv.handler, "127.0.0.1", 0)
        actual = server.sockets[0].getsockname()[1]
    return srv, server, actual
