"""ローカル WebSocket サーバ：サンプル配信 + 接続ダイアログの制御チャネル。

1 本のソケットに両方を乗せる——制御（ポート一覧・クラウド状態）はサンプルが
流れ出す前から要るので、接続状態を 1 つにまとめた方が web 側が単純になる。

プロトコル（lib/mind/desktop-bridge.ts と対で保つ）:
  server→client  {"type":"state","state":{...}}   接続時・変化時・毎コマンド後の全量
                 {"type":"sample","sample":{...}}  EegSample そのまま（1Hz）
                 {"type":"log","msg":"..."}
  client→server  {"type":"scan"} / {"type":"connect","port":"COM3"} /
                 {"type":"disconnect"} / {"type":"demo","on":bool} /
                 {"type":"cloud","on":bool,"code":"AB23-CD45"}
コマンドに個別 ack は無く、必ず state 全量で答える（冪等・順序に依らない）。

websockets のバージョンは realtime（supabase 依存）が握っていて選べないため、
新旧どちらの API でも動く書き方に限定する：serve の二段 import・1 引数
ハンドラ・broadcast() ヘルパ不使用（配置がバージョン間で移動した）。
"""

import asyncio
import json
import logging

try:
    from websockets.asyncio.server import serve as ws_serve  # websockets >= 13
except ImportError:
    from websockets.server import serve as ws_serve  # type: ignore[no-redef]

from desktop_bridge import DesktopBridge

log = logging.getLogger("neurosync.ws")


class LocalServer:
    def __init__(self, bridge: DesktopBridge) -> None:
        self.bridge = bridge
        self.clients: set = set()

    async def emit(self, event: dict) -> None:
        """DesktopBridge.emitter として配線される。"""
        if not self.clients:
            return
        msg = json.dumps(event, ensure_ascii=False)
        for ws in list(self.clients):
            try:
                await ws.send(msg)
            except Exception:  # noqa: BLE001 — 切れた 1 クライアントで全体を止めない
                self.clients.discard(ws)

    async def handler(self, ws) -> None:
        self.clients.add(ws)
        try:
            await ws.send(
                json.dumps({"type": "state", "state": self.bridge.state()}, ensure_ascii=False)
            )
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
                await b.emit_log("ポートを選択してください")
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
            await b.emit_log(f"未知のコマンド: {t}")
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
