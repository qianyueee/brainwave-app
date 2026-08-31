"""デスクトップ測定アプリ（desktop_app.py）の設定永続化。

bridge_config.json（Tkinter GUI 用）とはファイルを分ける——両アプリを併用しても
互いの設定を上書きしないため。保存するのは「次回も同じでいいもの」だけ：
シリアルポート・クラウド配信用ペアリングコード・待受ポート・Supabase 上書き。

cloud_on は意図的に保存しない：クラウド同時配信は毎回 OFF から始まる。
既定 OFF が要件であり、起動しただけで前回設定のまま脳波データが外へ流れ出す
のは事故のもと——オンにする操作は毎回明示的に行わせる。コードだけ覚えておく。
"""

import json
import os

from config import app_dir

CONFIG_FILE = "desktop_config.json"

# HTTP は固定が絶対条件：localStorage は origin（ポート込み）単位で隔離される
# ので、ポートが揺れると保存済みの測定記録・測定者・チェック履歴が全部
# 「消えた」ように見える。WS は揺れてよい（実ポートはページ URL ?ws= で渡す）。
DEFAULT_HTTP_PORT = 17860
DEFAULT_WS_PORT = 17861


def config_path() -> str:
    return os.path.join(app_dir(), CONFIG_FILE)


def load() -> dict:
    try:
        with open(config_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save(data: dict) -> None:
    try:
        with open(config_path(), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def port_of(saved: dict, key: str, default: int) -> int:
    """設定ファイルの手編集ミスで起動不能にならないよう緩く読む。"""
    try:
        return int(saved.get(key, default))
    except (TypeError, ValueError):
        return default
