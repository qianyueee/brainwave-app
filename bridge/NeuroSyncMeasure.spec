# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec — デスクトップ測定アプリ（単一ファイル・ウィンドウ付き）。

Build:  pnpm build:desktop   （先に bridge/web/ を生成する。無いとここで止まる）
        pyinstaller NeuroSyncMeasure.spec   （Windows 上で実行。CI: build-desktop.yml）
Output: dist/NeuroSyncMeasure.exe

BrainLinkBridge.spec（従来の Tkinter ブリッジ）とは別ビルド。supabase スタックの
collect_all 一式は同じ理由（動的 import）で引き継ぎ、pywebview（WebView2 backend =
pythonnet/clr_loader）と同梱 UI（web/）が加わる。
"""

import os

from PyInstaller.utils.hooks import collect_all

if not os.path.isdir("web"):
    raise SystemExit(
        "bridge/web/ がありません。先にリポジトリ直下で `pnpm build:desktop` を実行してください。"
    )

datas, binaries, hiddenimports = [], [], []
for pkg in [
    "supabase",
    "realtime",
    "gotrue",
    "postgrest",
    "storage3",
    "supafunc",
    "websockets",
    "httpx",
    "httpcore",
    "h2",
    "hpack",
    "hyperframe",
    "anyio",
    "sniffio",
    "serial",
    # pywebview: WebView2（EdgeChromium）backend は .NET 経由で動的にロードされる
    "webview",
    "clr_loader",
    "pythonnet",
]:
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

# Lazily-imported modules that static analysis may miss.
hiddenimports += [
    "bridge_core",
    "publisher",  # desktop_bridge が遅延 import（純ローカル運用では読まない）
    "config",
    "csv_logger",
    "demo_source",
    "thinkgear",
    "desktop_config",
    "desktop_bridge",
    "local_server",
    "static_server",
    "serial.tools.list_ports",
    "webview.platforms.edgechromium",
    "webview.platforms.winforms",
    "clr",
]

# 同梱 UI（Next.js 静的書き出し、pnpm build:desktop が生成）
datas += [("web", "web")]

a = Analysis(
    ["desktop_app.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter"],  # デスクトップ版は Tk を使わない（gui.py は別 exe）
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="NeuroSyncMeasure",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # onefile（BrainLinkBridge と同じ配布 UX）。起動時に展開コストがかかるので、
    # AV 誤検知や起動時間が問題になったら onedir + zip へ切り替える（EXE から
    # a.binaries/a.datas を外して COLLECT を足す）。
    runtime_tmpdir=None,
    console=False,  # windowed app, no console
)
