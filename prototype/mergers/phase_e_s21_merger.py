#!/usr/bin/env python3
"""
PHASE E MERGER — Session 21: Excel export of registers + rollup
================================================================
Over v1.37.0 -> v1.38.0.

Embeds: _phase_e_s21_module.js. Buttons are added in the modules I own
(register editor header in _phase_e_s17, command center toolbar in
_phase_d_command_module), re-applied by the chain.

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Export button CSS
  3. Bump console banner v1.37.0 -> v1.38.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E21_JS = "_phase_e_s21_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E21_JS, 'r', encoding='utf-8') as f:
    e21 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e21 + "\n\n" + boot_anchor, "embed e21 module")

# 2. CSS
xl_css = """
/* \u2500\u2500 Phase E S21 \u2014 Excel export buttons \u2500\u2500 */
.reg-export { margin-left: 10px; padding: 2px 10px; border: 1px solid var(--rag-green, #1f8a3b); color: var(--rag-green, #1f8a3b); background: transparent; border-radius: 5px; font-size: 11.5px; font-weight: 600; cursor: pointer; }
.reg-export:hover { background: rgba(31,138,59,0.08); }
.cmd-export { margin: 4px 0 10px; }
.cmd-export .btn { border-color: var(--rag-green, #1f8a3b); color: var(--rag-green, #1f8a3b); }

</style>"""
src = must_replace(src, "\n</style>", xl_css, "export button CSS")

# 3. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.37.0 (Phase E Session 20 \u2014 Billing pipeline)",
                   "NLC Unified Project Control \u00b7 v1.38.0 (Phase E Session 21 \u2014 Excel export)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 21 merge complete → v1.38.0")
