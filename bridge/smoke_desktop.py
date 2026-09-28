"""Windows アプリ（desktop_app.py / NeuroSync.exe）の起動確認。CI（build-desktop.yml）と手元で使う。

`--no-window --demo` で起動しておいてから実行する（ウィンドウも実機も要らない）:

    python desktop_app.py --no-window --demo      # または dist/NeuroSync.exe --no-window --demo
    python smoke_desktop.py [--platform desktop]

確かめること：
- 同梱した画面（静的書き出し）が、主要なページ・画面遷移の RSC（.txt）・チャンクとも
  正しい型とキャッシュ指定で返る（static_server.py）。`--platform desktop` のときは、
  Windows アプリ用のビルド（<html data-app-platform="desktop">）であることも
- ローカル WS が state と合成データの sample を送ってくる（local_server.py）
- よそのサイト（Origin）からの WS は切られる

依存は websockets だけ（requirements.txt）。失敗したら 1 で終わる。
"""

import argparse
import asyncio
import json
import re
import sys
import time
import urllib.error
import urllib.request

try:
    from websockets.asyncio.client import connect as ws_connect  # websockets >= 13
except ImportError:
    from websockets.client import connect as ws_connect  # type: ignore[no-redef]


def fail(msg: str) -> None:
    print(f"smoke: FAIL {msg}", flush=True)
    sys.exit(1)


def get(url: str) -> "tuple[int, dict, bytes]":
    try:
        with urllib.request.urlopen(url, timeout=5) as res:
            return res.status, {k.lower(): v for k, v in res.headers.items()}, res.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def wait_for_http(base: str, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            status, _, _ = get(base + "/")
            if status == 200:
                return
        except OSError:
            pass
        time.sleep(1)
    fail(f"{base}/ が {timeout:.0f} 秒以内に応答しない")


def check_http(base: str, platform: "str | None") -> None:
    status, headers, body = get(base + "/")
    html = body.decode("utf-8", "replace")
    if platform and f'data-app-platform="{platform}"' not in html:
        fail(f'/ が {platform} 用のビルドではない（data-app-platform="{platform}" が無い）')
    if "/brainwave-app/_next/" in html:
        fail("/ に /brainwave-app の basePath が焼き込まれている")

    for path in ("/", "/brain", "/session", "/report", "/history", "/settings", "/tree", "/player"):
        status, headers, _ = get(base + path)
        if status != 200 or not headers.get("content-type", "").startswith("text/html"):
            fail(f"{path} → {status} {headers.get('content-type')}")
        if headers.get("cache-control") != "no-cache":
            fail(f"{path} の Cache-Control が no-cache でない: {headers.get('cache-control')}")

    status, headers, _ = get(base + "/brain.txt?_rsc=smoke")
    if status != 200 or not headers.get("content-type", "").startswith("text/plain"):
        fail(f"/brain.txt（画面遷移の RSC）→ {status} {headers.get('content-type')}")

    chunks = re.findall(r'(/_next/static/[^"\']+\.(?:js|css))', html)
    if not chunks:
        fail("/ からチャンクが見つからない")
    for chunk in sorted(set(chunks))[:5]:
        status, headers, _ = get(base + chunk)
        want = "text/css" if chunk.endswith(".css") else "text/javascript"
        if status != 200 or not headers.get("content-type", "").startswith(want):
            fail(f"{chunk} → {status} {headers.get('content-type')}")
        if "immutable" not in headers.get("cache-control", ""):
            fail(f"{chunk} が immutable でない: {headers.get('cache-control')}")

    status, headers, _ = get(base + "/_next/static/smoke-missing.js")
    if status != 404 or "immutable" in headers.get("cache-control", ""):
        fail(f"無いチャンク → {status} {headers.get('cache-control')}（404 を長く覚えさせない）")
    print(f"smoke: ok  pages, RSC and chunks ({base})", flush=True)


async def check_ws(url: str, expect_demo: bool) -> None:
    state = None
    sample = None
    async with ws_connect(url) as ws:
        deadline = time.monotonic() + 15
        while (state is None or sample is None) and time.monotonic() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=max(0.1, deadline - time.monotonic()))
            except asyncio.TimeoutError:
                break
            msg = json.loads(raw)
            if msg.get("type") == "state":
                state = msg.get("state")
            elif msg.get("type") == "sample":
                sample = msg.get("sample")
    if not isinstance(state, dict):
        fail("WS から state が届かない")
    for key in ("running", "mode", "serial", "ports", "cloud", "authCallbackUrl"):
        if key not in state:
            fail(f"state に {key} が無い")
    if expect_demo:
        if not (state.get("running") and state.get("mode") == "demo"):
            fail(f"--demo なのに合成データが流れていない: running={state.get('running')} mode={state.get('mode')}")
        if not isinstance(sample, dict) or "ts" not in sample:
            fail("合成データの sample が届かない")
        if sample.get("synthetic") is not True:
            fail("合成データの sample に synthetic: true が無い（アカウントへ送られてしまう）")
    print(f"smoke: ok  WS state{' + demo sample' if expect_demo else ''} ({url})", flush=True)

    # よそのサイトからは繋がらない（local_server が 1008 で閉じる）
    got_state = False
    try:
        async with ws_connect(url, origin="https://example.com") as ws:
            raw = await asyncio.wait_for(ws.recv(), timeout=5)
            got_state = json.loads(raw).get("type") == "state"
    except Exception:  # noqa: BLE001 — 閉じられた（期待どおり）
        pass
    if got_state:
        fail("よその Origin からの WS に state が送られた")
    print("smoke: ok  foreign origin is refused", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="NeuroSync Windows アプリの起動確認")
    ap.add_argument("--http", type=int, default=17860)
    ap.add_argument("--ws", type=int, default=17861)
    ap.add_argument("--timeout", type=float, default=90, help="起動を待つ秒数（onefile の展開を含む）")
    ap.add_argument("--platform", default=None, help="desktop を渡すと Windows アプリ用のビルドかも確かめる")
    ap.add_argument("--no-demo", action="store_true", help="--demo 無しで起動したとき")
    args = ap.parse_args()

    base = f"http://127.0.0.1:{args.http}"
    wait_for_http(base, args.timeout)
    check_http(base, args.platform)
    asyncio.run(check_ws(f"ws://127.0.0.1:{args.ws}", expect_demo=not args.no_demo))
    print("smoke: all good", flush=True)


if __name__ == "__main__":
    main()
