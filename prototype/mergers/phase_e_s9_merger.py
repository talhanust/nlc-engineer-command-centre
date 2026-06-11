#!/usr/bin/env python3
"""
PHASE E MERGER — Session 9: Weighted aggregate S-curve + schedule slippage
===========================================================================
Over v1.25.0 -> v1.26.0.

Embeds: _phase_e_s9_module.js
(nodeHealth's schedule signal + child cards using nodeHealth live in their own
module files, re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Inject the aggregate S-curve into the command-centre innerHTML (after the child table)
  3. S-curve chart CSS
  4. Bump console banner v1.25.0 -> v1.26.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E9_JS = "_phase_e_s9_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
o_len, o_lines = len(src), src.count('\n')
print(f"Loaded {PATH}: {o_lines} lines, {o_len:,} chars")
with open(E9_JS, 'r', encoding='utf-8') as f:
    e9 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e9 + "\n\n" + boot_anchor, "embed e9 module")

# 2. inject the aggregate S-curve into renderCommandCenter (right after the child table close)
child_table_close = "'</tr></thead><tbody>' + childRows + '</tbody></table></div>' +"
src = must_replace(src, child_table_close,
                   child_table_close + "\n    (typeof renderNodeSCurveHtml === 'function' ? renderNodeSCurveHtml(node.id) : '') +   // Phase E S9 — weighted S-curve",
                   "command S-curve inject")

# 3. CSS
sc_css = """
/* \u2500\u2500 Phase E S9 \u2014 aggregate S-curve \u2500\u2500 */
.cmd-scurve { margin-top: 18px; }
.sc-svg { width: 100%; height: 210px; display: block; }
.sc-grid { stroke: var(--line, #e8edf4); stroke-width: 1; }
.sc-axis { fill: var(--ink-3, #8a94a3); font-size: 9px; }
.sc-planned { fill: none; stroke: var(--accent-3, #1e3a5f); stroke-width: 2; }
.sc-actual { fill: none; stroke: var(--nlc-accent, #e87722); stroke-width: 2; }
.sc-legend { font-size: 11.5px; color: var(--ink-2, #44506a); margin-top: 4px; }
.sc-key { display: inline-block; width: 14px; height: 3px; vertical-align: middle; margin: 0 4px 0 8px; }
.sc-k-planned { background: var(--accent-3, #1e3a5f); }
.sc-k-actual { background: var(--nlc-accent, #e87722); }

</style>"""
src = must_replace(src, "\n</style>", sc_css, "S-curve CSS")

# 4. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.25.0 (Phase E Session 8 \u2014 RAG health cues)",
                   "NLC Unified Project Control \u00b7 v1.26.0 (Phase E Session 9 \u2014 Weighted S-curve + slippage)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
n_len, n_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {n_lines} lines (+{n_lines - o_lines}), {n_len:,} chars (+{n_len - o_len:,})")
print("Phase E Session 9 merge complete → v1.26.0")
