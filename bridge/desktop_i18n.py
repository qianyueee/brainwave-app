"""デスクトップ測定アプリの画面へ送るログの英語版。

画面（Web）は日本語と英語を切り替えられるが、接続まわりのログはこちら（Python）で
作られて WS の {"type":"log","msg":…} と state.serial.detail で届く。そこで各ログに
英語を添えて送り（msgEn / detailEn）、画面が表示言語で選ぶ。

ログの多くは bridge_core.py（シリアル読み取り）と publisher.py（クラウド送信）が
作る日本語で、これらは従来のブリッジ（gui.py / main.py）と共用している——共用側の
文言は変えずに、ここで既知の文言を英語へ写す。知らない文言はそのまま返す
（英語の画面に日本語が1行混ざるだけで、情報は失われない）。
"""

from __future__ import annotations

import re

_PORT_HINTS_EN = (
    "  Windows: COM3, COM4, etc. (Settings → Bluetooth → More options → COM ports)\n"
    "  macOS:   /dev/cu.BrainLink_Pro, etc.\n"
    "  Linux:   /dev/rfcomm0, etc."
)

# (日本語の形, 英語) — 上から順に試す。グループは英語側で同じ番号を使う。
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # bridge_core._serial_reader
    (re.compile(r"^(.+) を開きました（(\d+) baud）$"), r"Opened \1 (\2 baud)"),
    (re.compile(r"^ポートを開けません: (.*)$", re.S), r"Can't open the port: \1"),
    (re.compile(r"^5秒後に再試行します（電源とペアリングを確認）$"), "Retrying in 5 seconds (check the power and pairing)"),
    (re.compile(r"^シリアルエラー: (.*) — 5秒後に再試行$", re.S), r"Serial error: \1 — retrying in 5 seconds"),
    (re.compile(r"^記録先: (.*)$"), r"Saving to: \1"),
    # publisher.SupabasePublisher
    (re.compile(r"^接続完了 channel=(.*)$"), r"Connected (channel=\1)"),
    (re.compile(r"^接続失敗: (.*) — (\d+)s 後に再試行します$", re.S), r"Connection failed: \1 — retrying in \2s"),
    (re.compile(r"^presence track 失敗（続行します）: (.*)$", re.S), r"Presence tracking failed (continuing): \1"),
    (re.compile(r"^送信失敗 \((\d+)/(\d+)\): (.*)$", re.S), r"Send failed (\1/\2): \3"),
    (re.compile(r"^連続失敗のため再接続します$"), "Reconnecting after repeated failures"),
]


def log_en(msg: str) -> str:
    """既知のログ文言を英語にする。知らないものはそのまま。"""
    if not msg:
        return msg
    # ポート名の例（bridge_core.PORT_HINTS を丸ごと含む複数行）は行ごと差し替える。
    if msg.startswith("ポート名の例:"):
        return "Port name examples:\n" + _PORT_HINTS_EN
    for pattern, repl in _PATTERNS:
        if pattern.search(msg):
            return pattern.sub(repl, msg, count=1)
    return msg
