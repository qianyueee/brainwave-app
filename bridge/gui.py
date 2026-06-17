"""BrainLink ブリッジ — 界面付き版（Windows 配布用）

PyInstaller で単一の .exe にまとめて配布します（利用者は Python 不要）。
アカウント・ポートを入力 →「測定を開始」で、ヘッドセットの脳波を
クラウド経由でスマホの Web アプリに送信します。設定は実行ファイルの隣の
bridge_config.json に保存されます。
"""

import asyncio
import os
import queue as queuelib
import threading
import tkinter as tk
from tkinter import messagebox, ttk

from bridge_core import run_bridge
from config import Config, app_dir, load_saved, save_config

POLL_MS = 120


def list_serial_ports() -> list[str]:
    try:
        from serial.tools import list_ports

        return [p.device for p in list_ports.comports()]
    except Exception:
        return []


class BridgeGUI:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        root.title("BrainLink ブリッジ")
        root.geometry("460x620")
        root.minsize(420, 560)

        self.events: queuelib.Queue = queuelib.Queue()
        self.stop: threading.Event | None = None
        self.worker: threading.Thread | None = None
        self.saved = load_saved()

        self._build()
        self.root.after(POLL_MS, self._poll)

    # ── UI ──────────────────────────────────────────────────────────────
    def _build(self) -> None:
        frm = ttk.Frame(self.root, padding=12)
        frm.pack(fill="both", expand=True)

        ttk.Label(frm, text="アカウント（アプリと同じ）", font=("", 11, "bold")).pack(anchor="w")
        self.email = self._field(frm, "メールアドレス", self.saved.get("email", ""))
        self.password = self._field(frm, "パスワード", self.saved.get("password", ""), show="*")

        ttk.Label(frm, text="BrainLink ポート", font=("", 11, "bold")).pack(anchor="w", pady=(10, 0))
        portrow = ttk.Frame(frm)
        portrow.pack(fill="x", pady=2)
        self.port = ttk.Combobox(portrow, values=list_serial_ports())
        self.port.set(self.saved.get("port", ""))
        self.port.pack(side="left", fill="x", expand=True)
        ttk.Button(portrow, text="更新", width=6, command=self._refresh_ports).pack(side="left", padx=(6, 0))

        self.demo_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            frm, text="デモモード（実機なしで動作確認）", variable=self.demo_var
        ).pack(anchor="w", pady=(6, 0))

        adv = ttk.LabelFrame(frm, text="詳細設定（クラウド接続）", padding=8)
        adv.pack(fill="x", pady=10)
        self.url = self._field(adv, "Supabase URL", self.saved.get("url", ""))
        self.key = self._field(adv, "Supabase anon key", self.saved.get("key", ""), show="*")

        btnrow = ttk.Frame(frm)
        btnrow.pack(fill="x", pady=4)
        self.start_btn = ttk.Button(btnrow, text="測定を開始", command=self.start)
        self.start_btn.pack(side="left", fill="x", expand=True, padx=(0, 4))
        self.stop_btn = ttk.Button(btnrow, text="停止", command=self.stop_bridge, state="disabled")
        self.stop_btn.pack(side="left", fill="x", expand=True, padx=(4, 0))

        status = ttk.Frame(frm)
        status.pack(fill="x", pady=(8, 0))
        self.serial_dot, self.serial_lbl = self._status_row(status, "シリアル接続")
        self.cloud_dot, self.cloud_lbl = self._status_row(status, "クラウド接続")
        self.sample_lbl = ttk.Label(status, text="集中 - / リラックス - / 信号 -")
        self.sample_lbl.pack(anchor="w", pady=(4, 0))
        self.count_lbl = ttk.Label(status, text="送信件数: 0")
        self.count_lbl.pack(anchor="w")

        ttk.Label(frm, text="ログ", font=("", 10, "bold")).pack(anchor="w", pady=(8, 0))
        self.log = tk.Text(frm, height=8, state="disabled", wrap="word")
        self.log.pack(fill="both", expand=True)

    def _field(self, parent: tk.Widget, label: str, value: str, show: str | None = None) -> ttk.Entry:
        ttk.Label(parent, text=label).pack(anchor="w")
        entry = ttk.Entry(parent, show=show)
        entry.insert(0, value)
        entry.pack(fill="x", pady=(0, 4))
        return entry

    def _status_row(self, parent: tk.Widget, label: str) -> tuple[tk.Label, ttk.Label]:
        row = ttk.Frame(parent)
        row.pack(anchor="w")
        dot = tk.Label(row, text="●", fg="#9aa0ac")
        dot.pack(side="left")
        lbl = ttk.Label(row, text=f"{label}：未接続")
        lbl.pack(side="left")
        lbl._base = label  # type: ignore[attr-defined]
        return dot, lbl

    def _refresh_ports(self) -> None:
        self.port["values"] = list_serial_ports()

    # ── Control ─────────────────────────────────────────────────────────
    def start(self) -> None:
        demo = self.demo_var.get()
        email = self.email.get().strip()
        password = self.password.get().strip()
        port = self.port.get().strip()
        url = self.url.get().strip()
        key = self.key.get().strip()

        if not demo and not port:
            messagebox.showwarning("入力エラー", "BrainLink ポートを選択してください。")
            return
        if not url or not key:
            messagebox.showwarning("入力エラー", "Supabase URL と anon key を入力してください。")
            return
        if not email or not password:
            messagebox.showwarning("入力エラー", "メールアドレスとパスワードを入力してください。")
            return

        save_config(
            {"email": email, "password": password, "port": port, "url": url, "key": key}
        )

        cfg = Config(
            supabase_url=url,
            supabase_anon_key=key,
            email=email,
            password=password,
            port=port,
            baud=115200,
            csv_dir=os.path.join(app_dir(), "logs"),
            demo=demo,
            dry_run=False,
        )

        self.stop = threading.Event()
        self.worker = threading.Thread(target=self._run, args=(cfg,), daemon=True)
        self.worker.start()

        self.start_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self._append_log("開始しました")

    def stop_bridge(self) -> None:
        if self.stop is not None:
            self.stop.set()
        self.stop_btn.config(state="disabled")
        self._append_log("停止中…")

    def _run(self, cfg: Config) -> None:
        try:
            asyncio.run(run_bridge(cfg, self.stop, self._emit))
        except Exception as e:  # noqa: BLE001
            self._emit({"type": "log", "msg": f"エラー: {e}"})
        finally:
            self._emit({"type": "stopped"})

    def _emit(self, ev: dict) -> None:
        # Called from the worker thread; Tkinter is touched only in _poll.
        self.events.put(ev)

    # ── Event pump (main thread) ────────────────────────────────────────
    def _poll(self) -> None:
        try:
            while True:
                ev = self.events.get_nowait()
                self._handle(ev)
        except queuelib.Empty:
            pass
        self.root.after(POLL_MS, self._poll)

    def _handle(self, ev: dict) -> None:
        t = ev.get("type")
        if t == "log":
            self._append_log(ev["msg"])
        elif t == "serial":
            self._set_dot(self.serial_dot, self.serial_lbl, ev["connected"])
        elif t == "cloud":
            self._set_dot(self.cloud_dot, self.cloud_lbl, ev["connected"])
        elif t == "sample":
            sig = ev["signal"]
            sig_txt = "良好" if sig == 0 else ("装着確認" if sig > 50 else str(sig))
            self.sample_lbl.config(
                text=f"集中 {ev['attention']} / リラックス {ev['meditation']} / 信号 {sig_txt}"
            )
            self.count_lbl.config(text=f"送信件数: {ev['count']}")
        elif t == "stopped":
            self.start_btn.config(state="normal")
            self.stop_btn.config(state="disabled")
            self._set_dot(self.serial_dot, self.serial_lbl, False)
            self._set_dot(self.cloud_dot, self.cloud_lbl, False)

    def _set_dot(self, dot: tk.Label, lbl: ttk.Label, ok: bool) -> None:
        dot.config(fg="#2fbf5f" if ok else "#9aa0ac")
        lbl.config(text=f"{lbl._base}：{'接続' if ok else '未接続'}")  # type: ignore[attr-defined]

    def _append_log(self, msg: str) -> None:
        self.log.config(state="normal")
        self.log.insert("end", msg + "\n")
        self.log.see("end")
        self.log.config(state="disabled")


def main() -> None:
    root = tk.Tk()
    BridgeGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
