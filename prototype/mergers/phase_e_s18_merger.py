#!/usr/bin/env python3
"""
PHASE E MERGER — Session 18: Exceptions feed (level dashboard)
===============================================================
Over v1.34.0 -> v1.35.0.

Embeds: _phase_e_s18_module.js
(renderExceptionsFeed is composed into the command center innerHTML — that edit
lives in _phase_d_command_module.js, re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Exceptions feed CSS
  3. Bump console banner v1.34.0 -> v1.35.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E18_JS = "_phase_e_s18_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E18_JS, 'r', encoding='utf-8') as f:
    e18 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e18 + "\n\n" + boot_anchor, "embed e18 module")

# 2. CSS
exc_css = """
/* \u2500\u2500 Phase E S18 \u2014 exceptions feed \u2500\u2500 */
.exc-feed { margin: 14px 0; border: 1px solid var(--line, #e3e8ef); border-radius: 9px; overflow: hidden; }
.exc-h { padding: 9px 14px; font-size: 12.5px; font-weight: 700; color: var(--ink-1, #1e2532); background: var(--bg-1, #f5f8fc); border-bottom: 1px solid var(--line, #e3e8ef); display: flex; align-items: center; gap: 10px; }
.exc-badge { font-size: 11px; font-weight: 600; color: var(--ink-3, #8a94a3); }
.exc-clear .exc-h { border-bottom: 0; }
.exc-none { padding: 12px 14px; font-size: 12.5px; color: var(--rag-green-ink, #1f7a43); }
.exc-row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--line-2, #f0f3f8); cursor: pointer; }
.exc-row:last-child { border-bottom: 0; }
.exc-row:hover { background: var(--bg-1, #f5f8fc); }
.exc-row.exc-red { border-left: 3px solid var(--rag-red, #c0392b); }
.exc-row.exc-amber { border-left: 3px solid var(--rag-amber, #d98a00); }
.exc-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
.exc-dot-red { background: var(--rag-red, #c0392b); }
.exc-dot-amber { background: var(--rag-amber, #d98a00); }
.exc-name { font-size: 13px; font-weight: 600; color: var(--ink-1, #1e2532); flex: 0 0 auto; min-width: 160px; }
.exc-reasons { flex: 1; font-size: 12px; color: var(--ink-2, #5a6573); }
.exc-go { color: var(--ink-3, #b3bcc9); font-size: 16px; }

</style>"""
src = must_replace(src, "\n</style>", exc_css, "exceptions feed CSS")

# 3. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.34.0 (Phase E Session 17 \u2014 Register editor)",
                   "NLC Unified Project Control \u00b7 v1.35.0 (Phase E Session 18 \u2014 Exceptions feed)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 18 merge complete → v1.35.0")
