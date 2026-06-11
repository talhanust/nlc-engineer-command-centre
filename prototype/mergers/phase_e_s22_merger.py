#!/usr/bin/env python3
"""
PHASE E MERGER — Session 22: Per-node comments / notes (final interactivity batch)
===================================================================================
Over v1.38.0 -> v1.39.0.

Embeds: _phase_e_s22_module.js
(renderNodeComments composes into the command center innerHTML — that edit
lives in _phase_d_command_module.js, re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Comments CSS
  3. Bump console banner v1.38.0 -> v1.39.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E22_JS = "_phase_e_s22_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E22_JS, 'r', encoding='utf-8') as f:
    e22 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e22 + "\n\n" + boot_anchor, "embed e22 module")

# 2. CSS
cmt_css = """
/* \u2500\u2500 Phase E S22 \u2014 node comments \u2500\u2500 */
.cmt-wrap { margin-top: 16px; }
.cmt-count { display: inline-block; min-width: 18px; padding: 0 6px; border-radius: 9px; background: var(--bg-1, #eef3fb); color: var(--ink-2, #44506a); font-size: 11px; font-weight: 700; text-align: center; }
.cmt-list { margin: 8px 0; }
.cmt-item { padding: 8px 11px; border: 1px solid var(--line, #e9edf3); border-left: 3px solid var(--accent, #1e6fd9); border-radius: 6px; margin-bottom: 6px; background: var(--bg-0, #fff); }
.cmt-text { font-size: 13px; color: var(--ink-1, #1e2532); white-space: pre-wrap; }
.cmt-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 11px; color: var(--ink-3, #8a94a3); }
.cmt-del { border: 0; background: transparent; color: var(--ink-3, #b3bcc9); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 4px; }
.cmt-del:hover { color: var(--rag-red, #c0392b); }
.cmt-empty { padding: 10px 11px; font-size: 12.5px; color: var(--ink-3, #8a94a3); font-style: italic; }
.cmt-add { display: flex; gap: 8px; }
.cmt-input { flex: 1; padding: 6px 10px; border: 1px solid var(--line, #d7deea); border-radius: 6px; font-size: 13px; }
.cmt-input:focus { border-color: var(--accent, #1e6fd9); outline: none; }
.cmt-addbtn { padding: 6px 14px; border: 1px solid var(--accent, #1e6fd9); background: var(--accent, #1e6fd9); color: #fff; border-radius: 6px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.cmt-addbtn:hover { filter: brightness(1.05); }

</style>"""
src = must_replace(src, "\n</style>", cmt_css, "node comments CSS")

# 3. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.38.0 (Phase E Session 21 \u2014 Excel export)",
                   "NLC Unified Project Control \u00b7 v1.39.0 (Phase E Session 22 \u2014 Node comments)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 22 merge complete → v1.39.0")
