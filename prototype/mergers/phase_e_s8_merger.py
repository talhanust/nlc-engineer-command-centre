#!/usr/bin/env python3
"""
PHASE E MERGER — Session 8: RAG health cues
============================================
Over v1.24.0 -> v1.25.0.

Embeds: _phase_e_s8_module.js
(The RAG dots themselves are rendered by the command-module child rows and the
S5 breadcrumb chips, which call _ragDot/_healthFromTotals/nodeHealth — those
edits live in their own module files and are re-applied by the build chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. RAG dot + legend CSS
  3. Bump console banner v1.24.0 -> v1.25.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E8_JS = "_phase_e_s8_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
o_len, o_lines = len(src), src.count('\n')
print(f"Loaded {PATH}: {o_lines} lines, {o_len:,} chars")
with open(E8_JS, 'r', encoding='utf-8') as f:
    e8 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e8 + "\n\n" + boot_anchor, "embed e8 module")

# 2. CSS
rag_css = """
/* \u2500\u2500 Phase E S8 \u2014 RAG health dots \u2500\u2500 */
.rag-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: middle; flex: none; }
.rag-green { background: #2e9b57; }
.rag-amber { background: #e0a106; }
.rag-red { background: #c0392b; }
.bc-chip .rag-dot { width: 8px; height: 8px; margin-right: 5px; }

</style>"""
src = must_replace(src, "\n</style>", rag_css, "RAG CSS")

# 3. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.24.0 (Phase E Session 7 \u2014 Guided drill-down shell)",
                   "NLC Unified Project Control \u00b7 v1.25.0 (Phase E Session 8 \u2014 RAG health cues)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
n_len, n_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {n_lines} lines (+{n_lines - o_lines}), {n_len:,} chars (+{n_len - o_len:,})")
print("Phase E Session 8 merge complete → v1.25.0")
