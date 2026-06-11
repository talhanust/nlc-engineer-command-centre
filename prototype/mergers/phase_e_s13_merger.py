#!/usr/bin/env python3
"""
PHASE E MERGER — Session 13: Shareable deep-link (URL reflects active node)
===========================================================================
Over v1.29.0 -> v1.30.0.

Embeds: _phase_e_s13_module.js
(_syncNodeHash is called at the end of applyShellMode — that edit lives in
_phase_e_s7_module.js, re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. boot: apply an incoming deep link just before "Ready" (after migrations+refreshAll)
  3. Bump console banner v1.29.0 -> v1.30.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E13_JS = "_phase_e_s13_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E13_JS, 'r', encoding='utf-8') as f:
    e13 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e13 + "\n\n" + boot_anchor, "embed e13 module")

# 2. boot: apply incoming deep link right before the final 'Ready' status line
ready_line = "document.getElementById('footerStatus').textContent = 'Ready \u00b7 ' + new Date().toLocaleTimeString();"
src = must_replace(src, ready_line,
                   "if (typeof _applyNodeHashNav === 'function') { try { _applyNodeHashNav(); } catch (e) {} }\n  " + ready_line,
                   "boot deep-link apply")

# 3. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.29.0 (Phase E Session 12 \u2014 Interactive S-curve)",
                   "NLC Unified Project Control \u00b7 v1.30.0 (Phase E Session 13 \u2014 Shareable deep-link)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 13 merge complete → v1.30.0")
