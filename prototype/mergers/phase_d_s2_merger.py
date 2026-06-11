#!/usr/bin/env python3
"""
PHASE D MERGER — Session 2: Aggregated cash flow + top-bar navigator
=====================================================================
Over v1.13.0 -> v1.14.0.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place)
Embeds:       _phase_d_s2_module.js

Transforms (each must hit exactly once):
  1. Embed _phase_d_s2_module.js before the boot anchor
  2. Inject aggregated cash-flow section into renderCommandCenter
  3. Top-bar org-navigator host (after the project switcher)
  4. Hook renderOrgNavigator into refreshAll
  5. Navigator + cash-flow CSS
  6. Bump console banner v1.13.0 -> v1.14.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
S2_JS = "_phase_d_s2_module.js"


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

with open(S2_JS, 'r', encoding='utf-8') as f:
    s2_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + s2_js + "\n\n" + boot_anchor, "embed s2 module")

# ── 2. Inject cash-flow into renderCommandCenter (after the child table) ─
old_tail = "'</tbody></table></div>' +"
new_tail = ("'</tbody></table></div>' +\n"
            "    (typeof renderNodeCashFlowHtml === 'function' ? renderNodeCashFlowHtml(node.id) : '') +")
src = must_replace(src, old_tail, new_tail, "command-center cashflow injection")

# ── 3. Top-bar navigator host (after project switcher) ───────────────
old_sw_host = '      <div class="ctrl" id="projectSwitcherHost"></div>'
new_sw_host = old_sw_host + '\n      <div class="ctrl" id="orgNavHost"></div>'
src = must_replace(src, old_sw_host, new_sw_host, "orgNav host")

# ── 4. Hook renderOrgNavigator into refreshAll ───────────────────────
old_refresh = ("function refreshAll() {\n"
               "  refreshHeader();\n"
               "  if (typeof renderHeader === 'function') renderHeader();\n"
               "  if (typeof renderProjectSwitcher === 'function') renderProjectSwitcher();")
new_refresh = old_refresh + "\n  if (typeof renderOrgNavigator === 'function') renderOrgNavigator();"
src = must_replace(src, old_refresh, new_refresh, "refreshAll orgNav hook")

# ── 5. CSS ───────────────────────────────────────────────────────────
s2_css = """
/* \u2500\u2500 Phase D S2 \u2014 top-bar navigator + cash-flow section \u2500\u2500 */
#orgNavHost select { min-width: 200px; }
.cmd-cashflow { margin-top: 18px; }
.cmd-cf-chart { overflow-x: auto; margin-bottom: 8px; }
.cmd-cf-table { font-size: 12px; }

</style>"""
src = must_replace(src, "\n</style>", s2_css, "s2 CSS")

# ── 6. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.13.0 (Phase D Session 1 \u2014 Command Center)",
                   "NLC Unified Project Control \u00b7 v1.14.0 (Phase D Session 2 \u2014 Aggregated Cash Flow + Navigator)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase D Session 2 merge complete → v1.14.0")
