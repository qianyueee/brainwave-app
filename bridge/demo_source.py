"""Synthetic EEG sample generator — Python port of the web app's DummySource.

Used by `main.py --demo` to verify the cloud path (Supabase auth + Realtime
broadcast) end-to-end without a headset.
"""

import math
import random
import time

QUADRANT_CENTERS = {
    "flow": (75, 75),
    "stress": (75, 25),
    "fatigue": (25, 25),
    "deepMeditation": (25, 75),
}


def _clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def _jitter(spread: float = 0.35) -> float:
    return math.exp(random.gauss(0, spread))


class DemoSource:
    def __init__(self) -> None:
        now = time.time()
        self.att = 55.0
        self.med = 55.0
        self.att_t = 70.0
        self.med_t = 70.0
        self.next_retarget = now + 8
        self.gamma_burst_until = 0.0
        self.next_gamma_burst = now + 12

    def next_sample(self) -> dict:
        now = time.time()

        if now >= self.next_retarget:
            a, m = random.choice(list(QUADRANT_CENTERS.values()))
            self.att_t = _clamp(a + (random.random() - 0.5) * 30, 5, 95)
            self.med_t = _clamp(m + (random.random() - 0.5) * 30, 5, 95)
            self.next_retarget = now + 8 + random.random() * 7

        if now >= self.next_gamma_burst:
            self.gamma_burst_until = now + 5 + random.random() * 5
            self.next_gamma_burst = now + 25 + random.random() * 20

        self.att = _clamp(self.att + (self.att_t - self.att) * 0.08 + random.gauss(0, 2.5), 0, 100)
        self.med = _clamp(self.med + (self.med_t - self.med) * 0.08 + random.gauss(0, 2.5), 0, 100)

        in_burst = now < self.gamma_burst_until
        base = 60000
        return {
            "attention": round(self.att),
            "meditation": round(self.med),
            "delta": round(base * 3 * _jitter(0.5)),
            "theta": round(base * (1 + (100 - self.att) / 50) * _jitter()),
            "lowAlpha": round(base * (0.5 + self.med / 60) * _jitter()),
            "highAlpha": round(base * (0.4 + self.med / 70) * _jitter()),
            "lowBeta": round(base * (0.4 + self.att / 70) * _jitter()),
            "highBeta": round(base * (0.3 + self.att / 80) * _jitter()),
            "lowGamma": round(base * (1.6 if in_burst else 0.18) * _jitter()),
            "highGamma": round(base * (1.1 if in_burst else 0.12) * _jitter()),
            "signal": 0,
            "battery": 80,
            "ts": int(now * 1000),
        }
