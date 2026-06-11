#!/usr/bin/env python3
"""
PHASE E MERGER — Session 6: Per-node one-page export brief
===========================================================
Over v1.22.0 -> v1.23.0.

Embeds: _phase_e_s6_module.js

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Top-bar "Export brief" button after the orgNavHost control
  3. Bump console banner v1.22.0 -> v1.23.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E6_JS = "_phase_e_s6_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
o_len, o_lines = len(src), src.count('\n')
print(f"Loaded {PATH}: {o_lines} lines, {o_len:,} chars")
with open(E6_JS, 'r', encoding='utf-8') as f:
    e6 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e6 + "\n\n" + boot_anchor, "embed e6 module")

# 2. top-bar export button after the orgNavHost control
src = must_replace(src, '<div class="ctrl" id="orgNavHost"></div>',
                   '<div class="ctrl" id="orgNavHost"></div>\n      <div class="ctrl"><button class="btn" onclick="exportNodeReport()" title="Print / Save as PDF a one-page brief for the current view">\u2913 Export brief</button></div>',
                   "export button")

# 3. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.22.0 (Phase E Session 5 \u2014 Editable salients + breadcrumb)",
                   "NLC Unified Project Control \u00b7 v1.23.0 (Phase E Session 6 \u2014 Per-node export brief)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
n_len, n_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {n_lines} lines (+{n_lines - o_lines}), {n_len:,} chars (+{n_len - o_len:,})")
print("Phase E Session 6 merge complete → v1.23.0")
