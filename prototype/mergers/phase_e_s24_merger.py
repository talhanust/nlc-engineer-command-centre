#!/usr/bin/env python3
"""
PHASE E MERGER — Session 24: Cash-flow chart hover tooltips (full-column)
=========================================================================
Over v1.40.0 -> v1.41.0.

Surgically augments the ORIGINAL renderCashFlowChart: adds one transparent
full-height hit-band per month carrying a consolidated <title> (Receipts ·
Payments · Net · Cumulative), rendered on top so the whole column is hoverable
even where a bar is thin or zero. The existing per-bar/dot titles are left in
place; nothing else about the chart changes.

Transforms (each must hit exactly once):
  1. Define `hitBands` just before the zero-line section
  2. Render ${hitBands} on top (just before the legend) in the returned SVG
  3. .cf-hit cursor CSS
  4. Bump console banner v1.40.0 -> v1.41.0
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

# 1. define hitBands before the zero-line comment
zero_comment = "  /* Y-axis zero line (relative to cumulative) */"
hitbands_def = (
    "  /* Phase E S24 \u2014 full-column hover hit-bands with consolidated tooltip */\n"
    "  const hitBands = buckets.map((b, i) => {\n"
    "    const hx = padL + i * monthW;\n"
    "    const net = (b.receipts || 0) - (b.payments || 0);\n"
    "    return `<rect class=\"cf-hit\" x=\"${hx.toFixed(1)}\" y=\"${padT}\" width=\"${monthW}\" height=\"${chartH}\" fill=\"transparent\"><title>${b.monthKey} \u2014 Receipts ${fmt.money(b.receipts)} \u00b7 Payments ${fmt.money(b.payments)} \u00b7 Net ${fmt.money(net)} \u00b7 Cumulative ${fmt.money(b.cumulative)}</title></rect>`;\n"
    "  }).join('');\n\n"
    + zero_comment
)
src = must_replace(src, zero_comment, hitbands_def, "hitBands definition")

# 2. render hit-bands on top, just before the legend
ret_anchor = "${cumDots}${legend}</svg>"
src = must_replace(src, ret_anchor, "${cumDots}${hitBands}${legend}</svg>", "render hitBands in SVG")

# 3. CSS
cf_css = """
/* \u2500\u2500 Phase E S24 \u2014 cash-flow hover bands \u2500\u2500 */
.fin-cashflow-chart .cf-hit { cursor: crosshair; }
.fin-cashflow-chart .cf-hit:hover { fill: rgba(30,58,95,0.05); }

</style>"""
src = must_replace(src, "\n</style>", cf_css, "cash-flow hit CSS")

# 4. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.40.0 (Phase E Session 23 \u2014 Project comments)",
                   "NLC Unified Project Control \u00b7 v1.41.0 (Phase E Session 24 \u2014 Cash-flow hover tooltips)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 24 merge complete → v1.41.0")
