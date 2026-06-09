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

import time

SYNC = 0xAA
EXCODE = 0x55
MAX_PLEN = 169

CODE_POOR_SIGNAL = 0x02
CODE_ATTENTION = 0x04
CODE_MEDITATION = 0x05
CODE_RAW = 0x80
CODE_ASIC_EEG_POWER = 0x83

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
        sample: dict | None = None
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
                if code == CODE_ASIC_EEG_POWER and vlen == 24:
                    bands = [
                        int.from_bytes(value_bytes[j : j + 3], "big")
                        for j in range(0, 24, 3)
                    ]
                    sample = {
                        "attention": self._attention,
                        "meditation": self._meditation,
                        **dict(zip(BAND_KEYS, bands)),
                        "signal": self._signal,
                        "ts": int(time.time() * 1000),
                    }
                # CODE_RAW and unknown rows: skipped
        return sample
