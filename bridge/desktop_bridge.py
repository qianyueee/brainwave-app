"""測定パイプラインの編成（デスクトップ測定アプリ用）。

bridge_core.run_bridge() は「設定1つで開始→停止まで一本道」という CLI/GUI 向け
ライフサイクルなので、ここでは使わない。代わりにその部品——_serial_reader
（シリアル→パーサ→キュー、5秒自動再試行）と _demo_producer——をそのまま
借りて、接続／切断／デモ切替／クラウド切替を動的に行えるオーケストレータを
組む。gui.py の list_serial_ports() を複製しているのは、gui.py がモジュール
先頭で tkinter を import していてヘッドレスでは import できないため。

スレッドモデル：すべてのメソッドは asyncio ループ内で呼ぶこと。シリアル
スレッドからのイベントだけが call_soon_threadsafe 経由で入ってくる。
"""

import asyncio
import logging
import threading
from typing import Awaitable, Callable, Optional

import desktop_config
from bridge_core import _demo_producer, _serial_reader
from config import (
    DEFAULT_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_URL,
    Config,
    default_csv_dir,
)
from csv_logger import CsvLogger

log = logging.getLogger("neurosync.bridge")

EmitFn = Callable[[dict], Awaitable[None]]


def list_serial_ports() -> list[dict]:
    """gui.py の同名関数のヘッドレス版（ダイアログ表示用に説明つき）。"""
    try:
        from serial.tools import list_ports

        return [
            {"device": p.device, "description": p.description or ""}
            for p in list_ports.comports()
        ]
    except Exception:
        return []


class DesktopBridge:
    """シリアル／デモの排他パイプライン + 任意のクラウド同時配信。"""

    def __init__(self, saved: dict) -> None:
        self.loop = asyncio.get_running_loop()
        # local_server 起動後に配線される（それまでの emit は握りつぶし）。
        self.emitter: Optional[EmitFn] = None

        self.csv_dir = saved.get("csv_dir") or default_csv_dir()
        self.supabase_url = saved.get("supabase_url") or DEFAULT_SUPABASE_URL
        self.supabase_key = saved.get("supabase_key") or DEFAULT_SUPABASE_ANON_KEY

        self.mode: Optional[str] = None  # "serial" | "demo" | None
        self.serial_status = "disconnected"  # "disconnected" | "connecting" | "connected"
        self.serial_port = str(saved.get("port", ""))
        self.serial_detail = ""
        self.ports = list_serial_ports()
        self.sample_count = 0
        self.csv_path: Optional[str] = None

        # クラウドは毎回 OFF 始まり（desktop_config.py 参照）。コードだけ復元。
        self.cloud_enabled = False
        self.cloud_connected = False
        self.cloud_code = str(saved.get("cloud_code", ""))

        self._stop: Optional[threading.Event] = None
        self._queue: Optional[asyncio.Queue] = None
        self._consumer: Optional[asyncio.Task] = None
        self._demo_task: Optional[asyncio.Task] = None

        self._publisher = None
        self._pub_task: Optional[asyncio.Task] = None
        self._pub_stop: Optional[threading.Event] = None

    # ── 状態スナップショット ────────────────────────────────────────────
    def state(self) -> dict:
        return {
            "running": self.mode is not None,
            "mode": self.mode,
            "serial": {
                "status": self.serial_status,
                "port": self.serial_port,
                "detail": self.serial_detail,
            },
            "ports": self.ports,
            "cloud": {
                "enabled": self.cloud_enabled,
                "connected": self.cloud_connected,
                "code": self.cloud_code,
            },
            "csvPath": self.csv_path,
            "sampleCount": self.sample_count,
        }

    def refresh_ports(self) -> None:
        self.ports = list_serial_ports()

    async def _emit(self, event: dict) -> None:
        if self.emitter is not None:
            await self.emitter(event)

    async def emit_state(self) -> None:
        await self._emit({"type": "state", "state": self.state()})

    async def emit_log(self, msg: str) -> None:
        log.info(msg)
        await self._emit({"type": "log", "msg": msg})

    # ── パイプライン（シリアル／デモ、排他） ────────────────────────────
    async def start_serial(self, port: str) -> None:
        await self.stop_pipeline()
        self.mode = "serial"
        self.serial_status = "connecting"
        self.serial_port = port
        self.serial_detail = ""
        self._save_config()
        self._start_common()
        # _serial_reader が読むのは port/baud だけ。クラウド欄は空でよい。
        cfg = Config(
            supabase_url="",
            supabase_anon_key="",
            pairing_code="",
            port=port,
            baud=115200,
            csv_dir=self.csv_dir,
            demo=False,
            dry_run=True,
        )
        threading.Thread(
            target=_serial_reader,
            args=(cfg, self.loop, self._queue, self._stop, self._emit_threadsafe),
            daemon=True,
        ).start()
        await self.emit_state()

    async def start_demo(self) -> None:
        await self.stop_pipeline()
        self.mode = "demo"
        self._start_common()
        self._demo_task = asyncio.create_task(_demo_producer(self._queue, self._stop))
        await self.emit_log("デモモード: 合成データを流します（実機不要）")
        await self.emit_state()

    def _start_common(self) -> None:
        self._stop = threading.Event()
        self._queue = asyncio.Queue()
        csv = CsvLogger(self.csv_dir)
        self.csv_path = csv.path
        self.sample_count = 0
        self._consumer = asyncio.create_task(self._consume(self._queue, self._stop, csv))

    async def stop_pipeline(self) -> None:
        if self._stop is not None:
            self._stop.set()
        if self._demo_task is not None:
            task, self._demo_task = self._demo_task, None
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if self._consumer is not None:
            task, self._consumer = self._consumer, None
            try:
                # 消費タスクは stop から 0.5 秒以内に抜ける（wait_for のタイムアウト幅）。
                await asyncio.wait_for(task, timeout=3)
            except asyncio.TimeoutError:
                task.cancel()
            except (asyncio.CancelledError, Exception):  # noqa: BLE001 — 後始末で落ちない
                pass
        self._stop = None
        self._queue = None
        self.mode = None
        self.serial_status = "disconnected"
        self.serial_detail = ""
        self.csv_path = None
        await self.emit_state()

    async def _consume(self, queue: asyncio.Queue, stop: threading.Event, csv: CsvLogger) -> None:
        try:
            while not stop.is_set():
                try:
                    sample = await asyncio.wait_for(queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue
                csv.write(sample)
                self.sample_count += 1
                if self._publisher is not None:
                    await self._publisher.publish(sample)
                # publisher.py が send_broadcast に渡すのと同じ dict をそのまま包む
                # （EegSample の三方 contract：lib/mind/types.ts ↔ publisher ↔ ここ）。
                await self._emit({"type": "sample", "sample": sample})
        finally:
            csv.close()

    def _emit_threadsafe(self, ev: dict) -> None:
        """シリアルスレッドの emit をループへ運ぶ（bridge_core の EmitFn 互換）。"""
        self.loop.call_soon_threadsafe(self._on_serial_event, ev)

    def _on_serial_event(self, ev: dict) -> None:
        t = ev.get("type")
        if t == "serial":
            if self.mode != "serial":
                return  # 停止後に遅れて届いた切断イベント
            connected = bool(ev.get("connected"))
            # 切断は終着ではない——_serial_reader は 5 秒ごとに再試行し続けるので
            # 「connecting + detail（理由）」として見せる。
            self.serial_status = "connected" if connected else "connecting"
            if connected:
                self.serial_detail = ""
            asyncio.ensure_future(self.emit_state())
        elif t == "log":
            msg = str(ev.get("msg", ""))
            if self.mode == "serial" and self.serial_status != "connected":
                self.serial_detail = msg.splitlines()[0]
                asyncio.ensure_future(self.emit_state())
            asyncio.ensure_future(self.emit_log(msg))

    # ── クラウド同時配信（既定 OFF・パイプラインと独立） ────────────────
    async def set_cloud(self, on: bool, code: Optional[str] = None) -> None:
        if code is not None:
            self.cloud_code = code.strip()
            self._save_config()
        if not on:
            self.cloud_enabled = False
            await self._close_publisher()
            await self.emit_state()
            return
        if not self.cloud_code:
            self.cloud_enabled = False
            await self.emit_log(
                "クラウド配信にはペアリングコードが必要です（スマホの Sync Brain「接続する」に表示されます）"
            )
            await self.emit_state()
            return
        await self._close_publisher()
        self.cloud_enabled = True
        self._pub_stop = threading.Event()
        self._pub_task = asyncio.create_task(self._connect_publisher())
        await self.emit_state()

    async def _connect_publisher(self) -> None:
        # 遅延 import：supabase スタックが重く、純ローカル運用では一切要らない。
        from publisher import SupabasePublisher

        cfg = Config(
            supabase_url=self.supabase_url,
            supabase_anon_key=self.supabase_key,
            pairing_code=self.cloud_code,
            port="",
            baud=115200,
            csv_dir=self.csv_dir,
            demo=False,
            dry_run=False,
        )
        pub = SupabasePublisher(cfg, log=lambda m: asyncio.ensure_future(self.emit_log(m)))
        stop = self._pub_stop
        await pub.connect(stop)
        if stop is None or stop.is_set():
            await pub.close()
            return
        self._publisher = pub
        self.cloud_connected = True
        await self.emit_log(f"クラウド配信を開始しました（コード: {self.cloud_code}）")
        await self.emit_state()

    async def _close_publisher(self) -> None:
        if self._pub_stop is not None:
            self._pub_stop.set()
        if self._pub_task is not None:
            task, self._pub_task = self._pub_task, None
            try:
                await asyncio.wait_for(task, timeout=3)
            except asyncio.TimeoutError:
                task.cancel()
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        pub, self._publisher = self._publisher, None
        self.cloud_connected = False
        self._pub_stop = None
        if pub is not None:
            try:
                await pub.close()
            except Exception:  # noqa: BLE001
                pass

    async def shutdown(self) -> None:
        await self.stop_pipeline()
        await self._close_publisher()

    def _save_config(self) -> None:
        saved = desktop_config.load()
        saved.update({"port": self.serial_port, "cloud_code": self.cloud_code})
        desktop_config.save(saved)
