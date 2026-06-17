"""Configuration for the BrainLink bridge.

Two config sources:
- CLI (main.py): .env file + command-line overrides (load_config).
- GUI (gui.py): a JSON file saved next to the program (load_saved/save_config).
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass

from dotenv import load_dotenv


def app_dir() -> str:
    """Directory of the program: next to the .exe when frozen, else the source dir."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


CONFIG_FILE = "bridge_config.json"


def config_file_path() -> str:
    return os.path.join(app_dir(), CONFIG_FILE)


def load_saved() -> dict:
    """Load the GUI's saved settings (returns {} if none)."""
    try:
        with open(config_file_path(), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(data: dict) -> None:
    """Persist the GUI's settings next to the program."""
    try:
        with open(config_file_path(), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def default_csv_dir() -> str:
    return os.path.join(app_dir(), "logs")



@dataclass
class Config:
    supabase_url: str
    supabase_anon_key: str
    email: str
    password: str
    port: str
    baud: int
    csv_dir: str
    demo: bool
    dry_run: bool


def load_config() -> Config:
    load_dotenv()

    parser = argparse.ArgumentParser(
        description="BrainLink Pro → Supabase Realtime ブリッジ",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--port", default=os.getenv("EEG_PORT", ""), help="シリアルポート (例: COM3, /dev/cu.BrainLink_Pro)")
    parser.add_argument("--baud", type=int, default=int(os.getenv("EEG_BAUD", "115200")), help="ボーレート")
    parser.add_argument("--csv-dir", default=default_csv_dir(), help="CSVログの保存先")
    parser.add_argument("--demo", action="store_true", help="実機を使わず合成データを送信（クラウド経路の動作確認用）")
    parser.add_argument("--dry-run", action="store_true", help="クラウドに送信せず、解析とCSV保存のみ行う（実機の動作確認用）")
    args = parser.parse_args()

    cfg = Config(
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_anon_key=os.getenv("SUPABASE_ANON_KEY", ""),
        email=os.getenv("BRIDGE_EMAIL", ""),
        password=os.getenv("BRIDGE_PASSWORD", ""),
        port=args.port,
        baud=args.baud,
        csv_dir=args.csv_dir,
        demo=args.demo,
        dry_run=args.dry_run,
    )

    if not cfg.dry_run:
        missing = [
            name
            for name, val in [
                ("SUPABASE_URL", cfg.supabase_url),
                ("SUPABASE_ANON_KEY", cfg.supabase_anon_key),
                ("BRIDGE_EMAIL", cfg.email),
                ("BRIDGE_PASSWORD", cfg.password),
            ]
            if not val
        ]
        if missing:
            parser.error(
                f".env の設定が不足しています: {', '.join(missing)}\n"
                "bridge/.env.example をコピーして bridge/.env を作成してください。"
            )

    if not cfg.demo and not cfg.port:
        parser.error("シリアルポートが未指定です。--port か .env の EEG_PORT を設定してください。")

    return cfg
