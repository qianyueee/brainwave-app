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

# ── Per-Hz FFT spectrum from the raw waveform ──
# BrainLink/TGAM streams raw EEG samples (code 0x80) alongside the
# once-per-second band packet; we emit magnitudes for 1..SPECTRUM_MAX_HZ Hz.
# Pure Python (a windowed DFT over the target bins) keeps the packaged exe
# dependency-free.
#
# The window is cut by *sample count* (FFT_WINDOW samples), so the frequency
# axis depends entirely on how fast those samples actually arrived. Assuming a
# fixed 512 Hz was wrong: measured across two headsets, one delivers exactly 512
# raw samples per band packet and the other a steady 481 — a 6.4% deficit that
# put every frequency 6.4% too high (a true 40Hz peak drew at 42.6Hz). Bluetooth
# loss stretches the axis the same way, just less steadily. So the basis is now
# built for the *measured* rate (`rawPerSec`, median-smoothed over
# RATE_HISTORY seconds), and no spectrum is emitted at all while that rate is
# unknown or implausible — an axis we cannot label is worse than no chart.
SPECTRUM_MAX_HZ = 64
FS_NOMINAL = 512
FFT_WINDOW = 512

# Plausible raw rates, in samples per band packet. Below RATE_MIN too much of
# the window is missing for any labelling to survive (and it approaches the
# Nyquist limit of the top bin); above RATE_MAX we counted more samples than the
# hardware can produce, i.e. the byte stream is being misparsed.
RATE_MIN = 256
RATE_MAX = 560
# Seconds of `rawPerSec` kept for the median. Median, not mean, because the
# first count after start-up (and after a resync) covers a partial second.
RATE_HISTORY = 15
RATE_MIN_SAMPLES = 5
# Bases are ~SPECTRUM_MAX_HZ×FFT_WINDOW×2 floats each, so keep only a few.
BASIS_CACHE_MAX = 4

_BASIS_CACHE: dict = {}  # rate -> (hann[], cos[f][n], sin[f][n])


def _basis(rate: int):
    cached = _BASIS_CACHE.get(rate)
    if cached is not None:
        return cached
    if len(_BASIS_CACHE) >= BASIS_CACHE_MAX:
        _BASIS_CACHE.clear()
    w = FFT_WINDOW
    hann = [0.5 - 0.5 * math.cos(2 * math.pi * n / (w - 1)) for n in range(w)]
    cos_t, sin_t = [], []
    for f in range(1, SPECTRUM_MAX_HZ + 1):
        wf = 2 * math.pi * f / rate
        cos_t.append([math.cos(wf * n) for n in range(w)])
        sin_t.append([math.sin(wf * n) for n in range(w)])
    _BASIS_CACHE[rate] = (hann, cos_t, sin_t)
    return _BASIS_CACHE[rate]


def _spectrum(raw: "deque", rate: int) -> list | None:
    """Per-Hz magnitude (1..SPECTRUM_MAX_HZ Hz) of the last FFT_WINDOW raw
    samples, DC-removed and Hann-windowed, read at `rate` samples/second. None
    until a full window is buffered."""
    if len(raw) < FFT_WINDOW:
        return None
    x = list(raw)
    mean = sum(x) / FFT_WINDOW
    hann, cos_t, sin_t = _basis(rate)
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

def _fmt_counts(counts: dict) -> str:
    """`key:count;key:count` for the non-zero entries, oldest-stable order.
    Empty string when there is nothing to report, so the CSV cell stays blank
    in the normal case instead of carrying a row of zeros."""
    return ";".join("%s:%d" % (k, v) for k, v in sorted(counts.items()) if v)


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
        self._raw: deque = deque(maxlen=FFT_WINDOW)  # raw waveform ring
        self._raw_since_bands = 0  # raw samples seen since the last band packet
        self._rate_hist: deque = deque(maxlen=RATE_HISTORY)  # recent rawPerSec
        # Diagnostics, reset at every band packet (same window as rawPerSec):
        # what the payload walk did *not* consume, and where framing broke.
        self._skipped: dict = {}
        self._parse_err = {"chk": 0, "trunc": 0, "plen": 0}

    def _skip(self, key: str) -> None:
        self._skipped[key] = self._skipped.get(key, 0) + 1

    def _effective_rate(self) -> int | None:
        """Raw samples per second, as actually measured — the sampling rate the
        spectrum's frequency axis is built on. None while too few counts have
        been seen to smooth, or when the result is outside RATE_MIN..RATE_MAX."""
        if len(self._rate_hist) < RATE_MIN_SAMPLES:
            return None
        ordered = sorted(self._rate_hist)
        rate = ordered[len(ordered) // 2]
        return rate if RATE_MIN <= rate <= RATE_MAX else None

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
                self._parse_err["plen"] += 1
                del self._buf[:2]  # bad length: skip this sync pair, resync
                continue
            if len(self._buf) < 3 + plen + 1:
                break  # wait for more bytes

            payload = bytes(self._buf[3 : 3 + plen])
            if ((~sum(payload)) & 0xFF) != self._buf[3 + plen]:
                # The checksum failing means this was never a packet — most
                # often a 0xAA 0xAA pair that happens to fall inside raw sample
                # bytes, matched because an earlier byte was lost and the buffer
                # is no longer aligned. Consuming the plen bytes it claimed
                # would throw away up to 173 bytes of stream (≈21 raw samples),
                # including whatever real packets sit inside them, turning one
                # lost byte into a burst. Skip the sync pair only and rescan.
                self._parse_err["chk"] += 1
                del self._buf[:2]
                continue
            del self._buf[: 3 + plen + 1]

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
                self._skip("excode")
                i += 1
            if i >= n:
                self._parse_err["trunc"] += 1
                break
            code = payload[i]
            i += 1
            if code < 0x80:
                if i >= n:
                    self._parse_err["trunc"] += 1
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
                    self._skip("%02x" % code)
            else:
                if i >= n:
                    self._parse_err["trunc"] += 1
                    break
                vlen = payload[i]
                i += 1
                if i + vlen > n:
                    # The row claims more bytes than the payload holds, so the
                    # walk is off the rails and everything after it is lost.
                    self._parse_err["trunc"] += 1
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
                else:
                    # Anything we do not consume — a proprietary BrainLink row,
                    # or a RAW/ASIC row of an unexpected length. Recorded with
                    # its length because "0x80 with vlen 3" and "0x80 with vlen
                    # 2" mean very different things: the first is raw waveform
                    # we are silently throwing away.
                    self._skip("%02x/%d" % (code, vlen))

        if bands is None:
            return None
        sample = {
            "attention": self._attention,
            "meditation": self._meditation,
            **dict(zip(BAND_KEYS, bands)),
            "signal": self._signal,
            # How many raw samples arrived since the previous band packet — the
            # instantaneous sampling rate. The first value after start-up (or
            # after a resync) covers a partial second and is expected to be low.
            "rawPerSec": self._raw_since_bands,
            # Rows the payload walk did not consume, `<code>/<vlen>:<count>`
            # (single-byte codes have no length). Normally empty — a steady
            # entry here means the headset speaks a dialect we ignore, and if
            # the key is a RAW code that is missing waveform.
            "skipRows": _fmt_counts(self._skipped),
            # Framing failures: chk = checksum mismatch (resync), trunc = a row
            # claiming more bytes than the payload holds (the rest of that
            # packet is lost), plen = an impossible length byte. Normally empty.
            "parseErr": _fmt_counts(self._parse_err),
            "ts": int(time.time() * 1000),
        }
        self._rate_hist.append(self._raw_since_bands)
        self._raw_since_bands = 0
        self._skipped = {}
        self._parse_err = {"chk": 0, "trunc": 0, "plen": 0}

        # The smoothed rate the spectrum's Hz axis was actually built on. Kept
        # separate from rawPerSec because that one still jitters second to
        # second; this is the number the frequencies were divided by, so a
        # spectrum can always be re-labelled from the archived row alone.
        rate = self._effective_rate()
        if rate is not None:
            sample["specRate"] = rate
            spectrum = _spectrum(self._raw, rate)
            if spectrum is not None:
                sample["spectrum"] = spectrum
        return sample
