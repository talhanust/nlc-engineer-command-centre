#!/usr/bin/env python3
"""
PHASE E MERGER — Session 5: Editable salients + persistent breadcrumb
======================================================================
Over v1.21.0 -> v1.22.0.

Embeds: _phase_e_s5_module.js

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Breadcrumb host bar before the module-switch nav
  3. refreshAll: render the breadcrumb (after renderOrgNavigator)
  4. Settings: "Project Details" card before the demo-data card
  5. switchModule: render the salients editor when entering Settings
  6. CSS (breadcrumb bar)
  7. Bump console banner v1.21.0 -> v1.22.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E5_JS = "_phase_e_s5_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
o_len, o_lines = len(src), src.count('\n')
print(f"Loaded {PATH}: {o_lines} lines, {o_len:,} chars")
with open(E5_JS, 'r', encoding='utf-8') as f:
    e5 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e5 + "\n\n" + boot_anchor, "embed e5 module")

# 2. breadcrumb host before the module-switch nav
src = must_replace(src, '<nav class="module-switch">',
                   '<div id="breadcrumbHost" class="breadcrumb-bar"></div>\n<nav class="module-switch">',
                   "breadcrumb host")

# 3. refreshAll hook (after renderOrgNavigator)
nav_hook = "  if (typeof renderOrgNavigator === 'function') renderOrgNavigator();"
src = must_replace(src, nav_hook,
                   nav_hook + "\n  if (typeof renderBreadcrumb === 'function') renderBreadcrumb();",
                   "refreshAll breadcrumb hook")

# 4. Settings "Project Details" card (before the demo-data card)
demo_card = '<div class="settings-card demo-data-card">'
sal_card = ('<div class="settings-card salients-card">\n'
            '      <div class="settings-card-title">Project Details</div>\n'
            '      <div class="settings-card-sub">Set a project\u2019s client, consultant, contract reference and start / finish dates. These appear in the header and on every page when that project is selected.</div>\n'
            '      <div id="salientsHost">\u2014</div>\n'
            '    </div>\n    ' + demo_card)
src = must_replace(src, demo_card, sal_card, "settings salients card")

# 5. switchModule render hook (after the demo hook)
demo_hook = "  if (mod === 'settings' && typeof renderDemoControls === 'function') renderDemoControls();"
src = must_replace(src, demo_hook,
                   demo_hook + "\n  if (mod === 'settings' && typeof renderSalientsEditor === 'function') renderSalientsEditor();",
                   "switchModule salients hook")

# 6. CSS
bc_css = """
/* \u2500\u2500 Phase E S5 \u2014 breadcrumb bar + salients \u2500\u2500 */
.breadcrumb-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 7px 18px; background: var(--bg-1, #f7f9fc); border-bottom: 1px solid var(--line, #e3e8ef); font-size: 12.5px; }
.breadcrumb-bar:empty { display: none; }
.bc-path { display: flex; flex-wrap: wrap; align-items: center; }
.bc-crumb { cursor: pointer; color: var(--accent, #1e6fd9); text-decoration: none; }
.bc-crumb:hover { text-decoration: underline; }
.bc-cur { color: var(--ink-1, #1a2230); font-weight: 700; cursor: default; }
.bc-cur:hover { text-decoration: none; }
.bc-sep { margin: 0 7px; color: var(--ink-3, #b4bdcb); }
.bc-down { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.bc-down-label { font-size: 11px; color: var(--ink-3, #8a94a3); text-transform: uppercase; letter-spacing: .04em; }
.bc-chip { cursor: pointer; font-size: 11.5px; padding: 2px 9px; border: 1px solid var(--line, #d7deea); border-radius: 11px; color: var(--ink-2, #44506a); background: var(--bg-0, #fff); }
.bc-chip:hover { border-color: var(--accent, #1e6fd9); color: var(--accent, #1e6fd9); }
.salients-card { grid-column: 1 / -1; }

</style>"""
src = must_replace(src, "\n</style>", bc_css, "breadcrumb CSS")

# 7. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.21.0 (Phase E Session 4 \u2014 Command-centre header)",
                   "NLC Unified Project Control \u00b7 v1.22.0 (Phase E Session 5 \u2014 Editable salients + breadcrumb)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
n_len, n_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {n_lines} lines (+{n_lines - o_lines}), {n_len:,} chars (+{n_len - o_len:,})")
print("Phase E Session 5 merge complete → v1.22.0")
