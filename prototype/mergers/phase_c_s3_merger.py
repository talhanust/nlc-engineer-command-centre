#!/usr/bin/env python3
"""
PHASE C MERGER — Session 3: Portfolio Rollup
=============================================
Applies the cross-project rollup over v1.5.0 → produces v1.6.0.

Read-only. Compute model (locked): swap-compute-swap reusing computeAllKpis.
Placement: new 'Portfolio' module pane + top nav button. Drill-through: click
a project row to switch into it.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place, v1.5.0 → v1.6.0)
Embeds:       _portfolio_module.js

Transforms (each must hit exactly once):
  1. Embed _portfolio_module.js before the boot DOMContentLoaded anchor
  2. Insert Portfolio nav button before the Settings button
  3. Insert pane-portfolio section before pane-settings
  4. Hook renderPortfolio() into switchModule lazy-render
  5. Insert portfolio CSS before </style>
  6. Bump console banner v1.5.0 -> v1.6.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
PF_JS = "_portfolio_module.js"


def must_replace(src, old, new, label):
    count = src.count(old)
    if count != 1:
        snippet = old[:120].replace('\n', '\\n')
        sys.exit(f"FATAL [{label}]: expected exactly 1 occurrence, found {count}\n  near: {snippet}...")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
orig_len, orig_lines = len(src), src.count('\n')
print(f"Loaded {PATH}: {orig_lines} lines, {orig_len:,} chars")

with open(PF_JS, 'r', encoding='utf-8') as f:
    pf_js = f.read()

# ── 1. Embed module before boot anchor ───────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + pf_js + "\n\n" + boot_anchor, "embed _portfolio_module.js")

# ── 2. Portfolio nav button (before Settings) ────────────────────────
settings_btn = "    <button class=\"mod-btn\" data-module=\"settings\" onclick=\"switchModule('settings')\">"
portfolio_btn = (
    "    <button class=\"mod-btn portfolio\" data-module=\"portfolio\" onclick=\"switchModule('portfolio')\">\n"
    "      <span class=\"mod-icon\">\U0001F5C2</span> Portfolio\n"
    "    </button>\n"
)
src = must_replace(src, settings_btn, portfolio_btn + settings_btn, "Portfolio nav button")

# ── 3. pane-portfolio (before pane-settings) ─────────────────────────
settings_pane = '  <section class="module-pane" id="pane-settings">'
portfolio_pane = (
    '  <section class="module-pane" id="pane-portfolio">\n'
    '    <div class="section-head">\n'
    '      <div>\n'
    '        <div class="section-title">Portfolio</div>\n'
    '        <div class="section-subtitle">Cross-project KPI rollup across all PD HQs \u00b7 read-only \u00b7 click a row to open that project</div>\n'
    '      </div>\n'
    '    </div>\n'
    '    <div id="portfolioHost">\u2014</div>\n'
    '  </section>\n\n'
)
src = must_replace(src, settings_pane, portfolio_pane + settings_pane, "pane-portfolio")

# ── 4. switchModule lazy-render hook ─────────────────────────────────
exec_line = "  if (mod === 'execution' && typeof renderExecutionDashboard === 'function') renderExecutionDashboard();"
src = must_replace(src, exec_line,
                   exec_line + "\n  if (mod === 'portfolio' && typeof renderPortfolio === 'function') renderPortfolio();",
                   "switchModule portfolio hook")

# ── 5. Portfolio CSS ─────────────────────────────────────────────────
pf_css = """
/* \u2500\u2500 Phase C S3 \u2014 Portfolio rollup \u2500\u2500 */
.portfolio-wrap { overflow-x: auto; }
.portfolio-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.portfolio-table th, .portfolio-table td { padding: 7px 10px; border-bottom: 1px solid var(--line, #e6e6e6); white-space: nowrap; }
.portfolio-table th { text-align: left; font-weight: 600; color: var(--ink-2, #555); background: var(--bg-2, #f7f7f7); }
.portfolio-table th.num, .portfolio-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.portfolio-table td.pf-name, .portfolio-table th.pf-name { text-align: left; font-weight: 500; }
.pf-row { cursor: pointer; }
.pf-row:hover { background: var(--bg-hover, #f0f6ff); }
.pf-active { background: var(--bg-accent, #eef4ff); }
.pf-badge { font-size: 10px; font-weight: 600; color: #fff; background: var(--accent, #1e6fd9); border-radius: 4px; padding: 1px 5px; vertical-align: middle; }
.portfolio-table tfoot .pf-total td { border-top: 2px solid var(--line-strong, #cfcfcf); font-weight: 700; }
.portfolio-note { margin-top: 10px; font-size: 11px; color: var(--ink-3, #888); }
.portfolio-empty { color: var(--ink-3, #aaa); font-style: italic; padding: 16px 0; }

</style>"""
src = must_replace(src, "\n</style>", pf_css, "portfolio CSS")

# ── 6. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.5.0 (Phase C Session 2)",
                   "NLC Unified Project Control \u00b7 v1.6.0 (Phase C Session 3)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase C Session 3 merge complete → v1.6.0")
