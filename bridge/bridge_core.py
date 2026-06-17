"""Core bridge loop shared by the CLI (main.py) and the GUI (gui.py).

`run_bridge` reads samples (serial or demo), writes a CSV, and publishes to
Supabase Realtime. It reports progress through a thread-safe `emit(event)`
callback and stops promptly when the `stop` Event is set.

Event shapes passed to emit():
    {"type": "log", "msg": str}
    {"type": "serial", "connected": bool}
    {"type": "cloud", "connected": bool}
    {"type": "sample", "attention": int, "meditation": int,
                        "signal": int, "count": int}
"""

import asyncio
import threading
from typing import Callable

from config import Config
from csv_logger import CsvLogger
from demo_source import DemoSource
from thinkgear import ThinkGearParser

EmitFn = Callable[[dict], None]

PORT_HINTS = (
    "  Windows: COM3, COM4 など（設定 → Bluetooth → その他のオプション → COMポート）\n"
    "  macOS:   /dev/cu.BrainLink_Pro など\n"
    "  Linux:   /dev/rfcomm0 など"
)


def _serial_reader(
    cfg: Config,
    loop: asyncio.AbstractEventLoop,
    queue: "asyncio.Queue",
    stop: threading.Event,
    emit: EmitFn,
) -> None:
    """Blocking serial loop (runs in a thread): bytes -> parser -> queue."""
    import serial  # imported here so demo mode works without the headset stack

    parser = ThinkGearParser()
    while not stop.is_set():
        try:
            with serial.Serial(cfg.port, cfg.baud, timeout=1) as ser:
                emit({"type": "serial", "connected": True})
                emit({"type": "log", "msg": f"{cfg.port} を開きました（{cfg.baud} baud）"})
                while not stop.is_set():
                    data = ser.read(ser.in_waiting or 1)
                    if not data:
                        continue
                    for sample in parser.feed(data):
                        loop.call_soon_threadsafe(queue.put_nowait, sample)
        except serial.SerialException as e:
            emit({"type": "serial", "connected": False})
            emit({"type": "log", "msg": f"ポートを開けません: {e}"})
            emit({"type": "log", "msg": f"ポート名の例:\n{PORT_HINTS}"})
            emit({"type": "log", "msg": "5秒後に再試行します（電源とペアリングを確認）"})
            stop.wait(5)
        except Exception as e:  # noqa: BLE001 — keep the bridge alive
            emit({"type": "serial", "connected": False})
            emit({"type": "log", "msg": f"シリアルエラー: {e} — 5秒後に再試行"})
            stop.wait(5)


async def _demo_producer(queue: "asyncio.Queue", stop: threading.Event) -> None:
    source = DemoSource()
    while not stop.is_set():
        queue.put_nowait(source.next_sample())
        await asyncio.sleep(1)


async def run_bridge(cfg: Config, stop: threading.Event, emit: EmitFn) -> None:
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    csv_logger = CsvLogger(cfg.csv_dir)
    emit({"type": "log", "msg": f"記録先: {csv_logger.path}"})

    publisher = None
    if not cfg.dry_run:
        from publisher import SupabasePublisher

        publisher = SupabasePublisher(cfg, log=lambda m: emit({"type": "log", "msg": m}))
        await publisher.connect(stop)
        if stop.is_set():
            await publisher.close()
            csv_logger.close()
            return
        emit({"type": "cloud", "connected": True})
    else:
        emit({"type": "log", "msg": "--dry-run: クラウド送信は行いません"})

    producer_task = None
    reader_thread = None
    if cfg.demo:
        emit({"type": "log", "msg": "デモモード: 合成データを使用します（実機不要）"})
        producer_task = asyncio.create_task(_demo_producer(queue, stop))
    else:
        reader_thread = threading.Thread(
            target=_serial_reader, args=(cfg, loop, queue, stop, emit), daemon=True
        )
        reader_thread.start()

    count = 0
    try:
        while not stop.is_set():
            try:
                sample = await asyncio.wait_for(queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            csv_logger.write(sample)
            if publisher is not None:
                await publisher.publish(sample)
            count += 1
            emit(
                {
                    "type": "sample",
                    "attention": sample["attention"],
                    "meditation": sample["meditation"],
                    "signal": sample.get("signal", 0),
                    "count": count,
                }
            )
    finally:
        stop.set()
        if producer_task is not None:
            producer_task.cancel()
        if publisher is not None:
            emit({"type": "cloud", "connected": False})
            try:
                await publisher.close()
            except Exception:  # noqa: BLE001
                pass
        csv_logger.close()
        emit({"type": "serial", "connected": False})
        emit({"type": "log", "msg": f"停止しました（合計 {count} 件、CSV: {csv_logger.path}）"})
