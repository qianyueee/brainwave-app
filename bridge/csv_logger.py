"""Per-session CSV archive: bridge/logs/session_YYYYmmdd_HHMMSS.csv

One row per band packet (≈1 Hz). New columns are appended at the end so older
logs stay readable by anything that reads this file by header name.

`spectrum` and `rawPerSec` are here to make a bad spectrum diagnosable after the
fact. Until now the per-Hz curve existed only in flight — computed on the bridge,
broadcast to the phone, reduced to one median curve per measurement — so a
recording that came out wrong left nothing behind to inspect. `rawPerSec` is the
partner column: `_spectrum` cuts its window by sample count and assumes it spans
one second, so a rate well below FS means the Hz axis of that row is stretched by
FS/rawPerSec rather than the brain having done anything unusual.
"""

import csv
import os
import time

FIELDS = [
    "ts",
    "attention",
    "meditation",
    "delta",
    "theta",
    "lowAlpha",
    "highAlpha",
    "lowBeta",
    "highBeta",
    "lowGamma",
    "highGamma",
    "signal",
    "battery",
    "rawPerSec",
    "spectrum",
]

# Separator inside the packed `spectrum` cell. Not a comma — that would split the
# cell across columns.
SPECTRUM_SEP = ";"


class CsvLogger:
    def __init__(self, csv_dir: str) -> None:
        os.makedirs(csv_dir, exist_ok=True)
        name = time.strftime("session_%Y%m%d_%H%M%S.csv")
        self.path = os.path.join(csv_dir, name)
        self._file = open(self.path, "w", newline="", encoding="utf-8")
        self._writer = csv.DictWriter(self._file, fieldnames=FIELDS, extrasaction="ignore")
        self._writer.writeheader()
        self._rows = 0

    def write(self, sample: dict) -> None:
        row = dict(sample)
        spectrum = row.get("spectrum")
        if isinstance(spectrum, (list, tuple)):
            row["spectrum"] = SPECTRUM_SEP.join(str(v) for v in spectrum)
        self._writer.writerow(row)
        self._rows += 1
        if self._rows % 10 == 0:
            self._file.flush()

    def close(self) -> None:
        self._file.flush()
        self._file.close()
