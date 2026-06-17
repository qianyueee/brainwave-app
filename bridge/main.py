"""BrainLink Pro → Supabase Realtime ブリッジ（コマンドライン版）

使い方:
    python main.py                 # 実機 + クラウド送信（本番）
    python main.py --demo         # 合成データでクラウド経路を確認（実機不要）
    python main.py --dry-run      # 実機の解析とCSV保存のみ（クラウド不要）
    python main.py --port COM4    # ポート指定

界面付きの配布版（Windows、Python不要）は gui.py / README を参照。
"""

import asyncio
import threading

from bridge_core import run_bridge
from config import Config, load_config


def console_emit(ev: dict) -> None:
    t = ev.get("type")
    if t == "log":
        print("[bridge]", ev["msg"])
    elif t == "serial":
        print("[serial]", "接続" if ev["connected"] else "切断")
    elif t == "cloud":
        print("[cloud]", "接続" if ev["connected"] else "切断")
    elif t == "sample" and ev["count"] % 10 == 0:
        print(
            f"[main] {ev['count']}件 | 集中 {ev['attention']} / "
            f"リラックス {ev['meditation']} / signal {ev['signal']}"
        )


def main() -> None:
    cfg: Config = load_config()
    stop = threading.Event()
    try:
        asyncio.run(run_bridge(cfg, stop, console_emit))
    except KeyboardInterrupt:
        stop.set()


if __name__ == "__main__":
    main()
