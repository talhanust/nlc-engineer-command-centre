#!/usr/bin/env python3
"""
PHASE E MERGER — Session 12: Interactive S-curve (tooltips + toggleable series)
================================================================================
Over v1.28.0 -> v1.29.0.

The interactivity (per-month hover hit-bands with <title>, point markers,
clickable legend toggling state.ui.scurveHide) lives in _phase_e_s9_module.js
renderNodeSCurveHtml + toggleScurveSeries/_scurveHidden — re-applied by the
chain. This merger adds the supporting CSS and bumps the banner.

Transforms (each must hit exactly once):
  1. Interactive S-curve CSS
  2. Bump console banner v1.28.0 -> v1.29.0
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
print(f"Loaded {PATH}: {len(src):,} chars")

# 1. CSS
sc_css = """
/* \u2500\u2500 Phase E S12 \u2014 interactive S-curve \u2500\u2500 */
.sc-dot-planned { fill: var(--accent-3, #1e3a5f); }
.sc-dot-actual { fill: var(--nlc-accent, #e87722); }
.sc-hit { fill: transparent; cursor: crosshair; }
.sc-hit:hover { fill: rgba(30,58,95,0.05); }
.sc-legend-item { cursor: pointer; -webkit-user-select: none; user-select: none; }
.sc-legend-item.sc-off { opacity: .42; text-decoration: line-through; }
.sc-hint { color: var(--ink-3, #99a3b2); font-size: 10.5px; font-style: italic; }

</style>"""
src = must_replace(src, "\n</style>", sc_css, "interactive S-curve CSS")

# 2. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.28.0 (Phase E Session 11 \u2014 Adjustable RAG thresholds)",
                   "NLC Unified Project Control \u00b7 v1.29.0 (Phase E Session 12 \u2014 Interactive S-curve)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 12 merge complete → v1.29.0")
