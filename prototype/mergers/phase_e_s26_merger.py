#!/usr/bin/env python3
"""
PHASE E MERGER — Session 26: XSS hardening (write-time text sanitizer)
======================================================================
Over v1.42.0 -> v1.43.0.

Embeds: _phase_e_s26_module.js (_sanitizeText). The write-path edits live in
_phase_e_s22 (comments), _phase_e_s17 (IPC notes) and _phase_e_s5 (salients),
re-applied by the chain.

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Bump console banner v1.42.0 -> v1.43.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E26_JS = "_phase_e_s26_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E26_JS, 'r', encoding='utf-8') as f:
    e26 = f.read()

boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e26 + "\n\n" + boot_anchor, "embed e26 module")

src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.42.0 (Phase E Session 25 \u2014 Filter re-aggregation)",
                   "NLC Unified Project Control \u00b7 v1.43.0 (Phase E Session 26 \u2014 XSS hardening)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 26 merge complete → v1.43.0")
