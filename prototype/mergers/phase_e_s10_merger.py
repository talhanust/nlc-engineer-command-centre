#!/usr/bin/env python3
"""
PHASE E MERGER — Session 10: Enriched export brief (RAG + S-curve)
===================================================================
Over v1.26.0 -> v1.27.0.

The enrichment itself lives in _phase_e_s6_module.js (buildNodeReportHtml now
embeds the node health badge + the weighted S-curve, with matching CSS in the
standalone document). This merger only bumps the build banner.

Transforms (each must hit exactly once):
  1. Bump console banner v1.26.0 -> v1.27.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
o_len = len(src)
print(f"Loaded {PATH}: {o_len:,} chars")

src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.26.0 (Phase E Session 9 \u2014 Weighted S-curve + slippage)",
                   "NLC Unified Project Control \u00b7 v1.27.0 (Phase E Session 10 \u2014 Enriched export brief)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 10 merge complete → v1.27.0")
