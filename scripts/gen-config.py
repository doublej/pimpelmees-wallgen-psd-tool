#!/usr/bin/env python3
"""
Generate src/modules/config-generated.jsx from wallgen's catalog.

Usage: gen-config.py <dimensions.json> [output.jsx]

Reads dimensions.json (with `diameters`, `widths`, `heights` arrays) and
emits ExtendScript (ES3) `var` declarations that the build concatenates
ahead of `config.jsx`.

BC vs MS partition is by explicit key set, not value threshold. When
wallgen adds a new diameter, this script fails loud rather than guessing
which shape it belongs to.
"""

import json
import sys
from pathlib import Path

BC_KEYS = {"D_0950", "D_1425", "D_1900", "D_2375"}
MS_KEYS = {"D_0300", "D_1000", "D_1200", "D_1400"}


def fail(msg):
    print("gen-config.py: " + msg, file=sys.stderr)
    sys.exit(1)


def js_array(values):
    return "[" + ", ".join(str(int(round(v))) for v in values) + "]"


def main(argv):
    if len(argv) < 2:
        fail("usage: gen-config.py <dimensions.json> [output.jsx]")

    src = Path(argv[1])
    if not src.exists():
        fail("catalog not found: " + str(src))

    with src.open() as f:
        data = json.load(f)

    diameters = data.get("diameters", [])
    widths = data.get("widths", [])
    heights = data.get("heights", [])

    diam_by_key = {d["key"]: float(d["value_mm"]) for d in diameters}
    width_by_key = {w["key"]: float(w["value_mm"]) for w in widths}
    height_by_key = {h["key"]: float(h["value_mm"]) for h in heights}

    seen = set(diam_by_key.keys())
    known = BC_KEYS | MS_KEYS
    extra = seen - known
    missing = known - seen
    if extra:
        fail("unexpected diameter keys (update gen-config.py): " + ", ".join(sorted(extra)))
    if missing:
        fail("catalog missing expected diameter keys: " + ", ".join(sorted(missing)))

    bc_vals = sorted(diam_by_key[k] for k in BC_KEYS)
    ms_vals = sorted(diam_by_key[k] for k in MS_KEYS)
    all_vals = sorted(diam_by_key.values())

    if "W_ARC" not in width_by_key:
        fail("catalog missing W_ARC in widths[]")
    if "H_ARC" not in height_by_key:
        fail("catalog missing H_ARC in heights[]")

    arc_w = width_by_key["W_ARC"]
    arc_h = height_by_key["H_ARC"]

    lines = [
        "// config-generated.jsx — GENERATED FROM wallgen/var/catalog/dimensions.json",
        "// DO NOT EDIT — re-run scripts/build.sh to refresh.",
        "",
        "var CATALOG_DIAMETERS_MM = " + js_array(all_vals) + ";",
        "var BC_DIAMETERS_MM = " + js_array(bc_vals) + ";",
        "var MS_DIAMETERS_MM = " + js_array(ms_vals) + ";",
        "var ARC_W_MM = " + str(int(round(arc_w))) + ";",
        "var ARC_H_MM = " + str(int(round(arc_h))) + ";",
        "",
    ]
    out_text = "\n".join(lines)

    if len(argv) >= 3:
        out = Path(argv[2])
        out.write_text(out_text)
    else:
        sys.stdout.write(out_text)


if __name__ == "__main__":
    main(sys.argv)
