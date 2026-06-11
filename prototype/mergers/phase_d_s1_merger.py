#!/usr/bin/env python3
"""
PHASE D MERGER — Session 1: Hierarchical Command Center
========================================================
Applies the command-center foundation over v1.12.0 → produces v1.13.0.

Active-node navigation (org tree), branch-node roll-up control centers
(subtree-scoped swap-compute-swap), breadcrumb + drill-down child list.
Leaf (project) nodes still open the existing detailed control center.
The S3 portfolio module is left intact (no regression).

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place, v1.12.0 → v1.13.0)
Embeds:       _phase_d_command_module.js

Transforms (each must hit exactly once):
  1. Embed _phase_d_command_module.js before the boot anchor
  2. Default state.org.activeNodeId at boot (after access migrate)
  3. Command nav button before Settings
  4. pane-command before pane-settings
  5. switchModule lazy-render hook for 'command'
  6. Command-center CSS
  7. Bump console banner v1.12.0 -> v1.13.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
CMD_JS = "_phase_d_command_module.js"


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

with open(CMD_JS, 'r', encoding='utf-8') as f:
    cmd_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + cmd_js + "\n\n" + boot_anchor, "embed command module")

# ── 2. Default activeNodeId at boot (after access migrate) ───────────
old_boot = ("  if (typeof migrateAccessControl === 'function') {\n"
            "    try { migrateAccessControl(); } catch (e) { console.warn('org access migrate failed', e); }\n"
            "  }")
new_boot = old_boot + ("\n  /* v1.13.0 \u2014 Phase D S1: default the active org node to the root. */\n"
                       "  if (state.org && !state.org.activeNodeId) state.org.activeNodeId = (typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc';")
src = must_replace(src, old_boot, new_boot, "boot activeNodeId default")

# ── 3. Command nav button (before Settings) ──────────────────────────
settings_btn = "    <button class=\"mod-btn\" data-module=\"settings\" onclick=\"switchModule('settings')\">"
command_btn = (
    "    <button class=\"mod-btn command\" data-module=\"command\" onclick=\"switchModule('command')\">\n"
    "      <span class=\"mod-icon\">\U0001F3DB</span> Command\n"
    "    </button>\n"
)
src = must_replace(src, settings_btn, command_btn + settings_btn, "Command nav button")

# ── 4. pane-command (before pane-settings) ───────────────────────────
settings_pane = '  <section class="module-pane" id="pane-settings">'
command_pane = (
    '  <section class="module-pane" id="pane-command">\n'
    '    <div class="section-head">\n'
    '      <div>\n'
    '        <div class="section-title">Command Center</div>\n'
    '        <div class="section-subtitle">Hierarchical roll-up \u00b7 HQ NLC \u2192 HQ Engrs \u2192 PD HQs \u2192 projects \u00b7 click to drill down</div>\n'
    '      </div>\n'
    '    </div>\n'
    '    <div id="commandHost">\u2014</div>\n'
    '  </section>\n\n'
)
src = must_replace(src, settings_pane, command_pane + settings_pane, "pane-command")

# ── 5. switchModule lazy-render hook ─────────────────────────────────
pf_hook = "  if (mod === 'portfolio' && typeof renderPortfolio === 'function') renderPortfolio();"
src = must_replace(src, pf_hook,
                   pf_hook + "\n  if (mod === 'command' && typeof renderCommandCenter === 'function') renderCommandCenter();",
                   "switchModule command hook")

# ── 6. Command-center CSS ────────────────────────────────────────────
cmd_css = """
/* \u2500\u2500 Phase D S1 \u2014 command center \u2500\u2500 */
.cmd-breadcrumb { font-size: 12px; margin-bottom: 10px; color: var(--ink-3, #888); }
.cmd-crumb { cursor: pointer; color: var(--accent, #1e6fd9); }
.cmd-crumb-cur { color: var(--ink-1, #222); font-weight: 600; cursor: default; }
.cmd-sep { margin: 0 6px; color: var(--ink-3, #bbb); }
.cmd-nodehead { font-size: 17px; font-weight: 700; margin-bottom: 12px; }
.cmd-nodetype { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #fff; background: var(--accent, #1e6fd9); border-radius: 4px; padding: 1px 6px; vertical-align: middle; }
.cmd-kpis { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.cmd-kpi { flex: 1 1 110px; border: 1px solid var(--line, #e6e6e6); border-radius: 8px; padding: 8px 12px; background: var(--bg-1, #fff); }
.cmd-kpi-label { font-size: 10.5px; color: var(--ink-3, #888); }
.cmd-kpi-val { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.cmd-childtitle { font-size: 12px; font-weight: 600; color: var(--ink-2, #555); margin-bottom: 6px; }
.cmd-wrap { overflow-x: auto; }
.cmd-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.cmd-table th, .cmd-table td { padding: 8px 10px; border-bottom: 1px solid var(--line, #eee); white-space: nowrap; }
.cmd-table th { text-align: left; background: var(--bg-2, #f7f7f7); font-weight: 600; }
.cmd-table th.num, .cmd-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.cmd-table td.cmd-name, .cmd-table th.cmd-name { text-align: left; font-weight: 500; }
.cmd-row { cursor: pointer; }
.cmd-row:hover { background: var(--bg-hover, #f0f6ff); }
.cmd-type { font-size: 10px; color: var(--ink-3, #999); font-weight: 400; }
.cmd-empty { color: var(--ink-3, #aaa); font-style: italic; text-align: center; }
.cmd-note { margin-top: 10px; font-size: 11px; color: var(--ink-3, #888); }

</style>"""
src = must_replace(src, "\n</style>", cmd_css, "command CSS")

# ── 7. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.12.0 (Phase C Session 9 \u2014 closeout)",
                   "NLC Unified Project Control \u00b7 v1.13.0 (Phase D Session 1 \u2014 Command Center)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase D Session 1 merge complete → v1.13.0")
