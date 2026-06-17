"""Supabase Realtime broadcast publisher (pairing-code based).

No account login: the bridge connects with the anon key only and publishes to
`eeg:{pairing_code}`, the same code the phone shows. This works regardless of
how the user logged into the app (Google, email, ...).

All Realtime calls are isolated in this class so the transport can be swapped
without touching the rest of the program.

KNOWN RISK: broadcast *publishing* from supabase-py / realtime-py is newer and
less battle-tested than the JS client, and method names have shifted between
realtime-py versions (`send_broadcast` vs `send(...)`). This module targets
supabase>=2.4 (`send_broadcast`). If publishing fails on your installed
version, check `pip show realtime` and see the README troubleshooting section.
"""

import asyncio
import re
import threading
import time
from typing import Callable, Optional

from supabase import AsyncClient, acreate_client

from config import Config

# Must match lib/mind/types.ts in the web app.
CHANNEL_PREFIX = "eeg:"
SAMPLE_EVENT = "sample"


def normalize_code(code: str) -> str:
    """Mirror of normalizePairingCode() in the web app."""
    return re.sub(r"[^A-Za-z0-9]", "", code).upper()

MAX_CONSECUTIVE_FAILURES = 3
BACKOFF_BASE_SEC = 2
BACKOFF_CAP_SEC = 60


class SupabasePublisher:
    def __init__(self, cfg: Config, log: Optional[Callable[[str], None]] = None) -> None:
        self.cfg = cfg
        self.client: AsyncClient | None = None
        self.channel = None
        self.channel_name = f"{CHANNEL_PREFIX}{normalize_code(cfg.pairing_code)}"
        self._failures = 0
        self._log = log or (lambda m: print("[publisher]", m))
        self._stop: Optional[threading.Event] = None

    async def connect(self, stop: Optional[threading.Event] = None) -> None:
        if stop is not None:
            self._stop = stop
        backoff = BACKOFF_BASE_SEC
        while self._stop is None or not self._stop.is_set():
            try:
                await self._connect_once()
                self._log(f"接続完了 channel={self.channel_name}")
                return
            except Exception as e:  # noqa: BLE001 — keep the bridge alive
                self._log(f"接続失敗: {e} — {backoff}s 後に再試行します")
                # Sleep in small steps so a stop request is honored quickly.
                for _ in range(backoff * 2):
                    if self._stop is not None and self._stop.is_set():
                        return
                    await asyncio.sleep(0.5)
                backoff = min(backoff * 2, BACKOFF_CAP_SEC)

    async def _connect_once(self) -> None:
        await self._teardown()
        self.client = await acreate_client(self.cfg.supabase_url, self.cfg.supabase_anon_key)
        # No login: anon key + a public broadcast channel keyed by the code.
        self.channel = self.client.channel(self.channel_name)
        await self.channel.subscribe()
        try:
            await self.channel.track(
                {
                    "role": "bridge",
                    "device": "BrainLink Pro",
                    "started_at": int(time.time() * 1000),
                }
            )
        except Exception as e:  # noqa: BLE001
            # Presence is best-effort: the web app also detects the bridge
            # from recent samples, so keep publishing even if track() fails.
            self._log(f"presence track 失敗（続行します）: {e}")
        self._failures = 0

    async def publish(self, sample: dict) -> None:
        if self.channel is None:
            return
        try:
            await self.channel.send_broadcast(SAMPLE_EVENT, sample)
            self._failures = 0
        except Exception as e:  # noqa: BLE001
            self._failures += 1
            self._log(f"送信失敗 ({self._failures}/{MAX_CONSECUTIVE_FAILURES}): {e}")
            if self._failures >= MAX_CONSECUTIVE_FAILURES:
                self._log("連続失敗のため再接続します")
                await self.connect(self._stop)

    async def close(self) -> None:
        await self._teardown()

    async def _teardown(self) -> None:
        if self.channel is not None:
            try:
                await self.channel.untrack()
            except Exception:  # noqa: BLE001
                pass
            try:
                await self.channel.unsubscribe()
            except Exception:  # noqa: BLE001
                pass
            self.channel = None
        self.client = None
