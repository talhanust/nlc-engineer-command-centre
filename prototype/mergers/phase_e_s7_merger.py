#!/usr/bin/env python3
"""
PHASE E MERGER — Session 7: Guided drill-down shell
====================================================
Over v1.23.0 -> v1.24.0.

Embeds: _phase_e_s7_module.js

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. refreshAll: applyShellMode at the end (after applyTheme)
  3. setActiveNode branch path: applyShellMode (climbing up to a branch hides tabs)
  4. Top-bar admin button (hidden by default; shown only at HQ Engrs / PD HQ)
  5. CSS for the admin button
  6. Bump console banner v1.23.0 -> v1.24.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E7_JS = "_phase_e_s7_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
o_len, o_lines = len(src), src.count('\n')
print(f"Loaded {PATH}: {o_lines} lines, {o_len:,} chars")
with open(E7_JS, 'r', encoding='utf-8') as f:
    e7 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e7 + "\n\n" + boot_anchor, "embed e7 module")

# 2. refreshAll end hook (after applyTheme)
theme_line = "  applyTheme(state.ui.theme || 'auto');\n}"
src = must_replace(src, theme_line,
                   "  applyTheme(state.ui.theme || 'auto');\n  if (typeof applyShellMode === 'function') applyShellMode();   // Phase E S7 — drill-down shell\n}",
                   "refreshAll shell hook")

# 3. setActiveNode branch path hook
branch_comment = "/* branch \u2192 stay in the command module, re-render the rollup */"
src = must_replace(src, branch_comment,
                   branch_comment + "\n  if (typeof applyShellMode === 'function') applyShellMode();   // Phase E S7",
                   "setActiveNode shell hook")

# 4. admin button after the export-brief control
export_ctrl = '<div class="ctrl"><button class="btn" onclick="exportNodeReport()" title="Print / Save as PDF a one-page brief for the current view">\u2913 Export brief</button></div>'
src = must_replace(src, export_ctrl,
                   export_ctrl + '\n      <div class="ctrl" id="adminCtrl" style="display:none"><button class="btn btn-admin" id="adminBtn" onclick="openAdmin()" title="Admin tools for this HQ / PD">\u2699 Admin</button></div>',
                   "admin button")

# 5. CSS
admin_css = """
/* \u2500\u2500 Phase E S7 \u2014 admin button \u2500\u2500 */
.btn.btn-admin { background: var(--accent-3, #1e3a5f); color: #fff; border-color: transparent; }
.btn.btn-admin:hover { filter: brightness(1.1); }

</style>"""
src = must_replace(src, "\n</style>", admin_css, "admin CSS")

# 6. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.23.0 (Phase E Session 6 \u2014 Per-node export brief)",
                   "NLC Unified Project Control \u00b7 v1.24.0 (Phase E Session 7 \u2014 Guided drill-down shell)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
n_len, n_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {n_lines} lines (+{n_lines - o_lines}), {n_len:,} chars (+{n_len - o_len:,})")
print("Phase E Session 7 merge complete → v1.24.0")
