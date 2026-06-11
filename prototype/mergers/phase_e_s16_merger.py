#!/usr/bin/env python3
"""
PHASE E MERGER — Session 16: Undo toasts + empty-state guidance
================================================================
Over v1.32.0 -> v1.33.0.

Embeds: _phase_e_s16_module.js
(_emptyStateHtml is consumed in _phase_d_command_module.js, re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Redirect the Archive button to the undo-wrapped variant
  3. Undo toast CSS
  4. Bump console banner v1.32.0 -> v1.33.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E16_JS = "_phase_e_s16_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E16_JS, 'r', encoding='utf-8') as f:
    e16 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e16 + "\n\n" + boot_anchor, "embed e16 module")

# 2. redirect Archive button onclick to the undo-wrapped variant
src = must_replace(src, "))archiveProject(", "))archiveProjectWithUndo(", "archive button → undo wrapper")

# 3. CSS
undo_css = """
/* \u2500\u2500 Phase E S16 \u2014 undo toast \u2500\u2500 */
.undo-toast { display: flex; align-items: center; gap: 14px; }
.undo-toast .undo-msg { flex: 1; }
.undo-toast .undo-btn { background: transparent; border: 1px solid rgba(255,255,255,0.55); color: inherit; border-radius: 5px; padding: 2px 12px; font-size: 12px; font-weight: 600; cursor: pointer; text-transform: uppercase; letter-spacing: .03em; }
.undo-toast .undo-btn:hover { background: rgba(255,255,255,0.16); }
.cmd-empty strong { color: var(--ink-1, #1e2532); font-weight: 600; }

</style>"""
src = must_replace(src, "\n</style>", undo_css, "undo toast CSS")

# 4. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.32.0 (Phase E Session 15 \u2014 Command palette)",
                   "NLC Unified Project Control \u00b7 v1.33.0 (Phase E Session 16 \u2014 Undo toasts + empty states)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 16 merge complete → v1.33.0")
