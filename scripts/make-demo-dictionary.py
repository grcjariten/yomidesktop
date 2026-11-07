"""Generate a small, original dictionary ZIP for the integration test."""
import argparse
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
args = parser.parse_args()
with ZipFile(args.output, "w", ZIP_DEFLATED) as archive:
    archive.writestr("index.json", json.dumps({
        "title": "YomiDesktop Demo", "format": 3, "revision": "1",
        "author": "YomiDesktop contributors", "description": "Original test definitions.",
    }))
    archive.writestr("term_bank_1.json", json.dumps([
        ["猫", "ねこ", "", "", 10, ["cat"], 1, ""],
        ["窓辺", "まどべ", "", "", 10, ["by the window"], 2, ""],
        ["眠る", "ねむる", "", "v5", 10, ["to sleep"], 3, ""],
    ], ensure_ascii=False))
