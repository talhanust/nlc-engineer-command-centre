#!/usr/bin/env python3
"""
PHASE E MERGER — Session 20: Billing pipeline (level dashboard 8c)
==================================================================
Over v1.36.0 -> v1.37.0.

Embeds: _phase_e_s20_module.js
(renderPipelineHtml composes into the command center innerHTML — that edit
lives in _phase_d_command_module.js, re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Billing pipeline CSS (with a draft→paid colour ramp)
  3. Bump console banner v1.36.0 -> v1.37.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E20_JS = "_phase_e_s20_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E20_JS, 'r', encoding='utf-8') as f:
    e20 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e20 + "\n\n" + boot_anchor, "embed e20 module")

# 2. CSS
pipe_css = """
/* \u2500\u2500 Phase E S20 \u2014 billing pipeline \u2500\u2500 */
.pipe-wrap { margin-top: 14px; }
.pipe-tot { font-size: 11px; font-weight: 600; color: var(--ink-3, #8a94a3); margin-left: 8px; }
.pipe-row { display: flex; align-items: center; gap: 12px; margin: 4px 0; }
.pipe-label { width: 130px; flex: 0 0 auto; font-size: 11.5px; color: var(--ink-2, #44506a); text-transform: capitalize; text-align: right; }
.pipe-bar-wrap { flex: 1; background: var(--bg-1, #f0f3f8); border-radius: 4px; overflow: hidden; height: 18px; }
.pipe-bar { height: 100%; border-radius: 4px; min-width: 2px; transition: width .25s ease; }
.pipe-meta { width: 168px; flex: 0 0 auto; font-size: 11.5px; display: flex; justify-content: space-between; gap: 10px; font-variant-numeric: tabular-nums; }
.pipe-count { color: var(--ink-3, #8a94a3); }
.pipe-count::after { content: ' IPC'; font-size: 10px; }
.pipe-val { color: var(--ink-1, #1e2532); font-weight: 600; }
/* draft \u2192 paid colour ramp */
.pipe-draft { background: #c3cbd6; }
.pipe-submitted { background: #9ab0d6; }
.pipe-vetted { background: #6f9bd8; }
.pipe-forwarded_to_client { background: #4f86c6; }
.pipe-approved { background: #3f9d7a; }
.pipe-paid_pending_ack { background: #2f9e57; }
.pipe-paid { background: #1f8a3b; }

</style>"""
src = must_replace(src, "\n</style>", pipe_css, "billing pipeline CSS")

# 3. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.36.0 (Phase E Session 19 \u2014 League table)",
                   "NLC Unified Project Control \u00b7 v1.37.0 (Phase E Session 20 \u2014 Billing pipeline)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 20 merge complete → v1.37.0")
