"""Per-session CSV archive: bridge/logs/session_YYYYmmdd_HHMMSS.csv"""

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
]


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
        self._writer.writerow(sample)
        self._rows += 1
        if self._rows % 10 == 0:
            self._file.flush()

    def close(self) -> None:
        self._file.flush()
        self._file.close()
