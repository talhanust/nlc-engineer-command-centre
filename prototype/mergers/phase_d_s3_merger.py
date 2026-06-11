#!/usr/bin/env python3
"""
PHASE D MERGER — Session 3: Consolidated IPC + RAR registers
=============================================================
Over v1.14.0 -> v1.15.0.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place)
Embeds:       _phase_d_s3_module.js

Transforms (each must hit exactly once):
  1. Embed _phase_d_s3_module.js before the boot anchor
  2. Inject registers into renderCommandCenter (after the cash-flow section)
  3. Register CSS
  4. Bump console banner v1.14.0 -> v1.15.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
S3_JS = "_phase_d_s3_module.js"


def must_replace(src, old, new, label):
    count = src.count(old)
    if count != 1:
        snippet = old[:120].replace('\n', '\\n')
        sys.exit(f"FATAL [{label}]: expected exactly 1 occurrence, found {count}\n  near: {snippet}...")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
orig_len, orig_lines = len(src), src.count('\n')
print(f"Loaded {PATH}: {orig_lines} lines, {orig_len:,} chars")

with open(S3_JS, 'r', encoding='utf-8') as f:
    s3_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + s3_js + "\n\n" + boot_anchor, "embed s3 module")

# ── 2. Inject registers after the cash-flow section ──────────────────
old_inject = "    (typeof renderNodeCashFlowHtml === 'function' ? renderNodeCashFlowHtml(node.id) : '') +"
new_inject = old_inject + "\n    (typeof renderNodeRegistersHtml === 'function' ? renderNodeRegistersHtml(node.id) : '') +"
src = must_replace(src, old_inject, new_inject, "command-center registers injection")

# ── 3. Register CSS ──────────────────────────────────────────────────
reg_css = """
/* \u2500\u2500 Phase D S3 \u2014 consolidated registers \u2500\u2500 */
.cmd-registers { margin-top: 18px; }
.cmd-reg-table { font-size: 11.5px; }
.cmd-reg-table th, .cmd-reg-table td { padding: 5px 9px; }
.cmd-status { font-size: 10px; text-transform: capitalize; color: var(--ink-2, #555); background: var(--bg-2, #f2f2f2); border-radius: 4px; padding: 1px 6px; }

</style>"""
src = must_replace(src, "\n</style>", reg_css, "registers CSS")

# ── 4. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.14.0 (Phase D Session 2 \u2014 Aggregated Cash Flow + Navigator)",
                   "NLC Unified Project Control \u00b7 v1.15.0 (Phase D Session 3 \u2014 Consolidated Registers)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase D Session 3 merge complete → v1.15.0")
