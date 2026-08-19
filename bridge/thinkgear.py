"""Minimal NeuroSky ThinkGear stream parser (BrainLink Pro / TGAM).

Packet format (see the public ThinkGear Communications Protocol):

    0xAA 0xAA <plen> <payload: plen bytes> <checksum>

* plen must be <= 169, otherwise resync.
* checksum = (~sum(payload)) & 0xFF.
* Payload is a sequence of DataRows:
    [EXCODE 0x55 ...] <code> [<vlength>] <value bytes>
  Codes < 0x80 carry a single value byte; codes >= 0x80 are followed by a
  length byte. Unknown rows are skipped by these rules, which keeps the
  parser tolerant of BrainLink proprietary extensions (gyro, battery, ...).

A complete sample dict (matching the web app's `EegSample`) is emitted each
time an ASIC_EEG_POWER row (0x83) arrives — once per second on real hardware.

If this parser misbehaves with your firmware, the official
Macrotellect/BrainLinkParser-Python can be vendored as a drop-in replacement
(see README).
"""

import math
import time
from collections import deque

SYNC = 0xAA
EXCODE = 0x55
MAX_PLEN = 169

CODE_POOR_SIGNAL = 0x02
CODE_ATTENTION = 0x04
CODE_MEDITATION = 0x05
CODE_RAW = 0x80
CODE_ASIC_EEG_POWER = 0x83

# ── Per-Hz FFT spectrum from the raw 512Hz waveform ──
# BrainLink/TGAM streams raw EEG samples (code 0x80) ~512×/sec. A 512-sample
# (1 s) window gives 1 Hz resolution; we emit magnitudes for 1..SPECTRUM_MAX_HZ
# Hz alongside the once-per-second band sample. Pure Python (a windowed DFT over
# 45 target bins) keeps the packaged exe dependency-free — ~23k mults/sec.
#
# NOTE: the basis below is built for FS Hz, and the window is cut by *sample
# count*, not by time. If raw samples go missing (Bluetooth hiccup, dropped
# bytes, a device that streams raw at another rate), the 512 buffered samples
# span more than a second and every frequency in the result is scaled by that
# span — a 10Hz alpha reads as 11Hz at 0.2% byte loss, 15Hz at 2%. Nothing here
# detects that, so each sample also carries `rawPerSec` (raw samples counted
# between consecutive band packets) and it is archived to the CSV: when a
# spectrum comes out wrong, that column says whether this is why.
SPECTRUM_MAX_HZ = 45
FS = 512
FFT_WINDOW = 512

_BASIS = None  # (hann[], cos[f][n], sin[f][n]) built lazily on first use


def _build_basis():
    global _BASIS
    w = FFT_WINDOW
    hann = [0.5 - 0.5 * math.cos(2 * math.pi * n / (w - 1)) for n in range(w)]
    cos_t, sin_t = [], []
    for f in range(1, SPECTRUM_MAX_HZ + 1):
        wf = 2 * math.pi * f / FS
        cos_t.append([math.cos(wf * n) for n in range(w)])
        sin_t.append([math.sin(wf * n) for n in range(w)])
    _BASIS = (hann, cos_t, sin_t)
    return _BASIS


def _spectrum(raw: "deque") -> list | None:
    """Per-Hz magnitude (1..SPECTRUM_MAX_HZ Hz) of the last FFT_WINDOW raw
    samples, DC-removed and Hann-windowed. None until a full window is buffered."""
    if len(raw) < FFT_WINDOW:
        return None
    x = list(raw)
    mean = sum(x) / FFT_WINDOW
    hann, cos_t, sin_t = _BASIS or _build_basis()
    win = [(x[n] - mean) * hann[n] for n in range(FFT_WINDOW)]
    out = []
    for f in range(SPECTRUM_MAX_HZ):
        cf, sf = cos_t[f], sin_t[f]
        re = im = 0.0
        for n in range(FFT_WINDOW):
            v = win[n]
            re += v * cf[n]
            im += v * sf[n]
        out.append(round(math.hypot(re, im) / FFT_WINDOW, 3))
    return out

BAND_KEYS = (
    "delta",
    "theta",
    "lowAlpha",
    "highAlpha",
    "lowBeta",
    "highBeta",
    "lowGamma",
    "highGamma",
)


class ThinkGearParser:
    def __init__(self) -> None:
        self._buf = bytearray()
        self._signal = 200
        self._attention = 0
        self._meditation = 0
        self._raw: deque = deque(maxlen=FFT_WINDOW)  # raw 512Hz waveform ring
        self._raw_since_bands = 0  # raw samples seen since the last band packet

    def feed(self, data: bytes) -> list[dict]:
        """Consume raw bytes; return any complete samples parsed from them."""
        self._buf.extend(data)
        samples: list[dict] = []

        while True:
            start = self._buf.find(bytes((SYNC, SYNC)))
            if start < 0:
                # Keep at most one trailing byte (could be the first SYNC).
                if len(self._buf) > 1:
                    del self._buf[:-1]
                break
            if start > 0:
                del self._buf[:start]
            if len(self._buf) < 3:
                break

            plen = self._buf[2]
            if plen > MAX_PLEN:
                del self._buf[:2]  # bad length: skip this sync pair, resync
                continue
            if len(self._buf) < 3 + plen + 1:
                break  # wait for more bytes

            payload = bytes(self._buf[3 : 3 + plen])
            checksum = self._buf[3 + plen]
            del self._buf[: 3 + plen + 1]

            if ((~sum(payload)) & 0xFF) != checksum:
                continue

            sample = self._parse_payload(payload)
            if sample is not None:
                samples.append(sample)

        return samples

    def _parse_payload(self, payload: bytes) -> dict | None:
        """Parse one packet payload; return a sample if it carried band powers.

        The sample is assembled *after* the whole payload has been walked rather
        than at the moment the ASIC_EEG_POWER row is seen. TGAM's once-per-second
        packet lists POOR_SIGNAL and ASIC_EEG_POWER *before* ATTENTION and
        MEDITATION, so reading the eSense values mid-walk shipped each second's
        bands with the *previous* second's attention/meditation (and made the
        very first sample 0/0). That one-second skew broke the indicators that
        require an eSense value and a band value from the same second. Building
        the dict at the end makes the result independent of row order.
        """
        bands: list[int] | None = None
        i = 0
        n = len(payload)
        while i < n:
            while i < n and payload[i] == EXCODE:
                i += 1
            if i >= n:
                break
            code = payload[i]
            i += 1
            if code < 0x80:
                if i >= n:
                    break
                value = payload[i]
                i += 1
                if code == CODE_POOR_SIGNAL:
                    self._signal = value
                elif code == CODE_ATTENTION:
                    self._attention = value
                elif code == CODE_MEDITATION:
                    self._meditation = value
            else:
                if i >= n:
                    break
                vlen = payload[i]
                i += 1
                if i + vlen > n:
                    break
                value_bytes = payload[i : i + vlen]
                i += vlen
                if code == CODE_RAW and vlen == 2:
                    # Signed 16-bit big-endian raw EEG sample (~512 Hz).
                    self._raw.append(int.from_bytes(value_bytes, "big", signed=True))
                    self._raw_since_bands += 1
                elif code == CODE_ASIC_EEG_POWER and vlen == 24:
                    bands = [
                        int.from_bytes(value_bytes[j : j + 3], "big")
                        for j in range(0, 24, 3)
                    ]
                # other unknown rows: skipped

        if bands is None:
            return None
        sample = {
            "attention": self._attention,
            "meditation": self._meditation,
            **dict(zip(BAND_KEYS, bands)),
            "signal": self._signal,
            # How many raw samples arrived since the previous band packet, i.e.
            # the real sampling rate of the window `_spectrum` just analysed.
            # ~FS means the Hz axis is trustworthy; well below it means the axis
            # is stretched by FS/rawPerSec. The first value after start-up (or
            # after a resync) covers a partial second and is expected to be low.
            "rawPerSec": self._raw_since_bands,
            "ts": int(time.time() * 1000),
        }
        self._raw_since_bands = 0
        spectrum = _spectrum(self._raw)
        if spectrum is not None:
            sample["spectrum"] = spectrum
        return sample
