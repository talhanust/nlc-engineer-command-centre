#!/usr/bin/env python3
"""
PHASE D MERGER — Session 5: Retire/merge the flat portfolio
============================================================
Over v1.16.0 -> v1.17.0. Folds the flat per-project list into the command
center (access-scoped, from rollup rows) and retires the standalone
Portfolio nav button. computePortfolio/renderPortfolio + pane-portfolio are
left intact (orphaned) so the Phase C portfolio smoke test stays green.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place)
Embeds:       _phase_d_s5_module.js

Transforms (each must hit exactly once):
  1. Embed _phase_d_s5_module.js before the boot anchor
  2. Inject flat subtree-project list into renderCommandCenter (before cash flow)
  3. Remove the Portfolio nav button
  4. Flat-list CSS
  5. Bump console banner v1.16.0 -> v1.17.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
S5_JS = "_phase_d_s5_module.js"


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

with open(S5_JS, 'r', encoding='utf-8') as f:
    s5_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + s5_js + "\n\n" + boot_anchor, "embed s5 module")

# ── 2. Inject flat subtree list before the cash-flow section ─────────
cashflow_line = "    (typeof renderNodeCashFlowHtml === 'function' ? renderNodeCashFlowHtml(node.id) : '') +"
flat_line = "    (typeof renderSubtreeProjectsHtml === 'function' ? renderSubtreeProjectsHtml(node.id) : '') +"
src = must_replace(src, cashflow_line, flat_line + "\n" + cashflow_line, "command-center flat-list injection")

# ── 3. Retire the Portfolio nav button (incl. its leading indentation) ─
portfolio_btn = ("    <button class=\"mod-btn portfolio\" data-module=\"portfolio\" onclick=\"switchModule('portfolio')\">\n"
                 "      <span class=\"mod-icon\">\U0001F5C2</span> Portfolio\n"
                 "    </button>\n")
src = must_replace(src, portfolio_btn, "", "retire Portfolio nav button")

# ── 4. Flat-list CSS ─────────────────────────────────────────────────
flat_css = """
/* \u2500\u2500 Phase D S5 \u2014 flat subtree project list \u2500\u2500 */
.cmd-allproj { margin-top: 16px; }
.cmd-allproj-table { font-size: 12px; }

</style>"""
src = must_replace(src, "\n</style>", flat_css, "flat-list CSS")

# ── 5. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.16.0 (Phase D Session 4 \u2014 Access-scoped Rollups)",
                   "NLC Unified Project Control \u00b7 v1.17.0 (Phase D Session 5 \u2014 Portfolio merged)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase D Session 5 merge complete → v1.17.0")
