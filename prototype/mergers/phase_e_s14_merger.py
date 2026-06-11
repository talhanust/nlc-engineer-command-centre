#!/usr/bin/env python3
"""
PHASE E MERGER — Session 14: Persistent global filter bar
==========================================================
Over v1.30.0 -> v1.31.0.

Embeds: _phase_e_s14_module.js
(The child-row filter skip + filter note live in _phase_d_command_module.js,
re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Filter bar host after the breadcrumb bar
  3. refreshAll: render the filter bar (after the breadcrumb)
  4. Filter bar CSS
  5. Bump console banner v1.30.0 -> v1.31.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E14_JS = "_phase_e_s14_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E14_JS, 'r', encoding='utf-8') as f:
    e14 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e14 + "\n\n" + boot_anchor, "embed e14 module")

# 2. filter bar host right after the breadcrumb bar
bc_host = '<div id="breadcrumbHost" class="breadcrumb-bar"></div>'
src = must_replace(src, bc_host,
                   bc_host + '\n<div id="filterBarHost" class="filter-bar"></div>',
                   "filter bar host")

# 3. refreshAll hook (after the breadcrumb render)
bc_hook = "  if (typeof renderBreadcrumb === 'function') renderBreadcrumb();"
src = must_replace(src, bc_hook,
                   bc_hook + "\n  if (typeof renderFilterBar === 'function') renderFilterBar();",
                   "refreshAll filter hook")

# 4. CSS
fb_css = """
/* \u2500\u2500 Phase E S14 \u2014 global filter bar \u2500\u2500 */
.filter-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 7px 18px; background: var(--bg-0, #fff); border-bottom: 1px solid var(--line, #e3e8ef); font-size: 12.5px; }
.filter-bar:empty { display: none; }
.fb-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-3, #8a94a3); font-weight: 600; }
.filter-bar input.fb-search { padding: 3px 8px; border: 1px solid var(--line, #d7deea); border-radius: 5px; font-size: 12.5px; min-width: 160px; }
.filter-bar select { padding: 3px 6px; border: 1px solid var(--line, #d7deea); border-radius: 5px; font-size: 12.5px; }
.fb-clear { padding: 3px 10px; border: 1px solid var(--line, #d7deea); border-radius: 5px; background: var(--bg-1, #f3f6fb); cursor: pointer; font-size: 12px; }
.fb-clear:hover { border-color: var(--accent, #1e6fd9); color: var(--accent, #1e6fd9); }
.filter-note { margin-top: 8px; font-size: 11.5px; color: var(--ink-3, #8a94a3); font-style: italic; }
.filter-note a { color: var(--accent, #1e6fd9); cursor: pointer; }

</style>"""
src = must_replace(src, "\n</style>", fb_css, "filter bar CSS")

# 5. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.30.0 (Phase E Session 13 \u2014 Shareable deep-link)",
                   "NLC Unified Project Control \u00b7 v1.31.0 (Phase E Session 14 \u2014 Global filter bar)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 14 merge complete → v1.31.0")
