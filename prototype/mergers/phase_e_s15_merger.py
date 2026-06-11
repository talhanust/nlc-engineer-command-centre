#!/usr/bin/env python3
"""
PHASE E MERGER — Session 15: Command palette + recent nodes + keyboard nav
===========================================================================
Over v1.31.0 -> v1.32.0.

Embeds: _phase_e_s15_module.js
(_pushRecentNode is called from applyShellMode — that edit lives in
_phase_e_s7_module.js, re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Palette overlay host after the filter bar host
  3. Palette CSS
  4. Bump console banner v1.31.0 -> v1.32.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E15_JS = "_phase_e_s15_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E15_JS, 'r', encoding='utf-8') as f:
    e15 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e15 + "\n\n" + boot_anchor, "embed e15 module")

# 2. palette overlay host (fixed/full-screen; DOM position is irrelevant)
fb_host = '<div id="filterBarHost" class="filter-bar"></div>'
src = must_replace(src, fb_host,
                   fb_host + '\n<div id="cmdPaletteHost" class="cmdp-host" style="display:none"></div>',
                   "palette overlay host")

# 3. CSS
cmdp_css = """
/* \u2500\u2500 Phase E S15 \u2014 command palette \u2500\u2500 */
.cmdp-host { position: fixed; inset: 0; z-index: 9999; }
.cmdp-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,0.38); }
.cmdp-modal { position: absolute; top: 14vh; left: 50%; transform: translateX(-50%); width: min(560px, 92vw); background: var(--bg-0, #fff); border: 1px solid var(--line, #d7deea); border-radius: 12px; box-shadow: 0 24px 64px rgba(15,23,42,0.32); overflow: hidden; }
.cmdp-input { width: 100%; box-sizing: border-box; padding: 15px 18px; border: 0; border-bottom: 1px solid var(--line, #eceff4); font-size: 16px; outline: none; background: transparent; color: var(--ink-1, #1e2532); }
.cmdp-list { max-height: 46vh; overflow-y: auto; padding: 6px; }
.cmdp-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 12px; border-radius: 8px; cursor: pointer; }
.cmdp-item.sel, .cmdp-item:hover { background: var(--bg-1, #eef3fb); }
.cmdp-name { font-size: 13.5px; color: var(--ink-1, #1e2532); font-weight: 500; }
.cmdp-type { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-3, #8a94a3); }
.cmdp-empty { padding: 18px; text-align: center; color: var(--ink-3, #8a94a3); font-size: 13px; }
.cmdp-foot { padding: 8px 14px; border-top: 1px solid var(--line, #eceff4); font-size: 10.5px; color: var(--ink-3, #99a3b2); }

</style>"""
src = must_replace(src, "\n</style>", cmdp_css, "palette CSS")

# 4. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.31.0 (Phase E Session 14 \u2014 Global filter bar)",
                   "NLC Unified Project Control \u00b7 v1.32.0 (Phase E Session 15 \u2014 Command palette)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 15 merge complete → v1.32.0")
