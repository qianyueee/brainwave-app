"""BrainLink Pro → Supabase Realtime ブリッジ

使い方:
    python main.py                 # 実機 + クラウド送信（本番）
    python main.py --demo         # 合成データでクラウド経路を確認（実機不要）
    python main.py --dry-run      # 実機の解析とCSV保存のみ（クラウド不要）
    python main.py --port COM4    # ポート指定

詳細は README.md を参照。
"""

import asyncio
import threading

from config import Config, load_config
from csv_logger import CsvLogger
from demo_source import DemoSource
from thinkgear import ThinkGearParser

PORT_HINTS = (
    "  Windows: COM3, COM4, ...（設定 → Bluetooth → その他のオプション → COMポート）\n"
    "  macOS:   /dev/cu.BrainLink_Pro など（ls /dev/cu.* で確認）\n"
    "  Linux:   /dev/rfcomm0 など"
)


def serial_reader(cfg: Config, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue, stop: threading.Event) -> None:
    """Blocking serial loop run in a thread: bytes -> parser -> queue."""
    import serial  # imported here so --demo works without pyserial issues

    parser = ThinkGearParser()
    while not stop.is_set():
        try:
            with serial.Serial(cfg.port, cfg.baud, timeout=1) as ser:
                print(f"[serial] {cfg.port} を開きました（{cfg.baud} baud）")
                while not stop.is_set():
                    data = ser.read(ser.in_waiting or 1)
                    if not data:
                        continue
                    for sample in parser.feed(data):
                        loop.call_soon_threadsafe(queue.put_nowait, sample)
        except serial.SerialException as e:
            print(f"[serial] ポートを開けません: {e}")
            print(f"[serial] ポート名の例:\n{PORT_HINTS}")
            print("[serial] 5秒後に再試行します（ヘッドセットの電源とペアリングを確認してください）")
            stop.wait(5)


async def demo_producer(queue: asyncio.Queue, stop: threading.Event) -> None:
    source = DemoSource()
    while not stop.is_set():
        queue.put_nowait(source.next_sample())
        await asyncio.sleep(1)


async def run(cfg: Config) -> None:
    queue: asyncio.Queue = asyncio.Queue()
    stop = threading.Event()
    loop = asyncio.get_running_loop()

    csv_logger = CsvLogger(cfg.csv_dir)
    print(f"[csv] 記録先: {csv_logger.path}")

    publisher = None
    if not cfg.dry_run:
        from publisher import SupabasePublisher

        publisher = SupabasePublisher(cfg)
        await publisher.connect()
    else:
        print("[main] --dry-run: クラウド送信は行いません")

    producer_task = None
    reader_thread = None
    if cfg.demo:
        print("[main] --demo: 合成データを送信します（実機不要）")
        producer_task = asyncio.create_task(demo_producer(queue, stop))
    else:
        reader_thread = threading.Thread(
            target=serial_reader, args=(cfg, loop, queue, stop), daemon=True
        )
        reader_thread.start()

    count = 0
    try:
        while True:
            sample = await queue.get()
            csv_logger.write(sample)
            if publisher is not None:
                await publisher.publish(sample)
            count += 1
            if count % 10 == 0:
                print(
                    f"[main] {count}件送信 | 集中 {sample['attention']} / "
                    f"リラックス {sample['meditation']} / signal {sample.get('signal', '-')}"
                )
    finally:
        stop.set()
        if producer_task is not None:
            producer_task.cancel()
        if publisher is not None:
            await publisher.close()
        csv_logger.close()
        if reader_thread is not None:
            reader_thread.join(timeout=3)
        print(f"[main] 終了しました（合計 {count} 件、CSV: {csv_logger.path}）")


def main() -> None:
    cfg = load_config()
    try:
        asyncio.run(run(cfg))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
