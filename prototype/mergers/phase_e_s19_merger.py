#!/usr/bin/env python3
"""
PHASE E MERGER — Session 19: Cross-node league table (level dashboard 8b)
=========================================================================
Over v1.35.0 -> v1.36.0.

Embeds: _phase_e_s19_module.js
(renderLeagueTable is composed into the command center innerHTML — that edit
lives in _phase_d_command_module.js, re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. League table CSS
  3. Bump console banner v1.35.0 -> v1.36.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E19_JS = "_phase_e_s19_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E19_JS, 'r', encoding='utf-8') as f:
    e19 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e19 + "\n\n" + boot_anchor, "embed e19 module")

# 2. CSS
league_css = """
/* \u2500\u2500 Phase E S19 \u2014 league table \u2500\u2500 */
.league-wrap { margin-top: 14px; }
.league-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.league-table th { padding: 7px 9px; border-bottom: 2px solid var(--line, #e3e8ef); color: var(--ink-3, #8a94a3); font-size: 11px; text-transform: uppercase; letter-spacing: .03em; text-align: left; }
.league-table th.num, .league-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.league-th { cursor: pointer; -webkit-user-select: none; user-select: none; white-space: nowrap; }
.league-th:hover { color: var(--accent, #1e6fd9); }
.league-th.league-active { color: var(--accent, #1e6fd9); }
.league-table td { padding: 7px 9px; border-bottom: 1px solid var(--line-2, #f0f3f8); }
.league-row { cursor: pointer; }
.league-row:hover { background: var(--bg-1, #f5f8fc); }
.league-rank { width: 34px; color: var(--ink-3, #99a3b2); font-weight: 600; text-align: center; }
.league-name { font-weight: 600; color: var(--ink-1, #1e2532); }

</style>"""
src = must_replace(src, "\n</style>", league_css, "league table CSS")

# 3. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.35.0 (Phase E Session 18 \u2014 Exceptions feed)",
                   "NLC Unified Project Control \u00b7 v1.36.0 (Phase E Session 19 \u2014 League table)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 19 merge complete → v1.36.0")
