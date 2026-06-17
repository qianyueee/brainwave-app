# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec — single-file windowed Windows build of the GUI bridge.

Build:  pyinstaller BrainLinkBridge.spec   (run on Windows; see README)
Output: dist/BrainLinkBridge.exe
"""

from PyInstaller.utils.hooks import collect_all

# supabase and its async stack use dynamic imports; pull everything in so the
# frozen exe doesn't fail at runtime with a missing submodule.
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
]:
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

# Local modules that are imported lazily (so static analysis may miss them).
hiddenimports += [
    "bridge_core",
    "publisher",
    "config",
    "csv_logger",
    "demo_source",
    "thinkgear",
    "serial.tools.list_ports",
]

a = Analysis(
    ["gui.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="BrainLinkBridge",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=False,  # windowed app, no console
)
