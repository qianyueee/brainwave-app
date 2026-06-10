"""Supabase auth + Realtime broadcast publisher.

All Realtime calls are isolated in this class so the transport can be swapped
without touching main.py.

KNOWN RISK: broadcast *publishing* from supabase-py / realtime-py is newer and
less battle-tested than the JS client, and method names have shifted between
realtime-py versions (`send_broadcast` vs `send(...)`). This module targets
supabase>=2.4 (`send_broadcast`). If publishing fails on your installed
version, check `pip show realtime` and see the README troubleshooting section.
"""

import asyncio
import time

from supabase import AsyncClient, acreate_client

from config import Config

# Must match lib/mind/types.ts in the web app.
CHANNEL_PREFIX = "eeg:"
SAMPLE_EVENT = "sample"

MAX_CONSECUTIVE_FAILURES = 3
BACKOFF_BASE_SEC = 2
BACKOFF_CAP_SEC = 60


class SupabasePublisher:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.client: AsyncClient | None = None
        self.channel = None
        self.user_id: str | None = None
        self._failures = 0

    async def connect(self) -> None:
        backoff = BACKOFF_BASE_SEC
        while True:
            try:
                await self._connect_once()
                print(f"[publisher] 接続完了 channel={CHANNEL_PREFIX}{self.user_id}")
                return
            except Exception as e:  # noqa: BLE001 — keep the bridge alive
                print(f"[publisher] 接続失敗: {e} — {backoff}s 後に再試行します")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, BACKOFF_CAP_SEC)

    async def _connect_once(self) -> None:
        await self._teardown()
        self.client = await acreate_client(self.cfg.supabase_url, self.cfg.supabase_anon_key)
        auth = await self.client.auth.sign_in_with_password(
            {"email": self.cfg.email, "password": self.cfg.password}
        )
        if auth.user is None:
            raise RuntimeError("ログインに失敗しました（メール/パスワードを確認してください）")
        self.user_id = auth.user.id

        self.channel = self.client.channel(f"{CHANNEL_PREFIX}{self.user_id}")
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
            print(f"[publisher] presence track 失敗（続行します）: {e}")
        self._failures = 0

    async def publish(self, sample: dict) -> None:
        if self.channel is None:
            return
        try:
            await self.channel.send_broadcast(SAMPLE_EVENT, sample)
            self._failures = 0
        except Exception as e:  # noqa: BLE001
            self._failures += 1
            print(f"[publisher] 送信失敗 ({self._failures}/{MAX_CONSECUTIVE_FAILURES}): {e}")
            if self._failures >= MAX_CONSECUTIVE_FAILURES:
                print("[publisher] 連続失敗のため再接続します")
                await self.connect()

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
        if self.client is not None:
            try:
                await self.client.auth.sign_out()
            except Exception:  # noqa: BLE001
                pass
            self.client = None
