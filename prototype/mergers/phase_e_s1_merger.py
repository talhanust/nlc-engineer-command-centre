#!/usr/bin/env python3
"""
PHASE E MERGER — Session 1: Per-project BOQ import + live wiring
=================================================================
Over v1.17.0 -> v1.18.0.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place)
Embeds:       _phase_e_s1_module.js

Transforms (each must hit exactly once):
  1. Embed _phase_e_s1_module.js before the boot anchor
  2. const BOQ_DATA -> let BOQ_DATA  (so it can be re-pointed per project)
  3. switchActiveProject: re-point BOQ_DATA after hydrating the working set
  4. boot: migrateProjectBoq + initial re-point (after the activeNodeId default)
  5. Settings: BOQ intake card after pane-settings opens
  6. switchModule: render the intake when entering Settings
  7. BOQ intake CSS
  8. Bump console banner v1.17.0 -> v1.18.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E1_JS = "_phase_e_s1_module.js"


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

with open(E1_JS, 'r', encoding='utf-8') as f:
    e1_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e1_js + "\n\n" + boot_anchor, "embed e1 module")

# ── 2. const BOQ_DATA -> let BOQ_DATA ────────────────────────────────
src = must_replace(src,
                   "const BOQ_DATA = JSON.parse(document.getElementById('boq-data').textContent);",
                   "let BOQ_DATA = JSON.parse(document.getElementById('boq-data').textContent);   // Phase E S1 — re-pointed per active project",
                   "BOQ_DATA const->let")

# ── 3. switchActiveProject re-point (AFTER activeProjectId is set) ────
old_sw = "  state.org.activeProjectId = projId;"
new_sw = old_sw + "\n  if (typeof _repointBoqData === 'function') _repointBoqData();   // Phase E S1 — per-project BOQ"
src = must_replace(src, old_sw, new_sw, "switchActiveProject BOQ re-point")

# ── 4. boot migrate + initial re-point ───────────────────────────────
old_boot = "  if (state.org && !state.org.activeNodeId) state.org.activeNodeId = (typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc';"
new_boot = old_boot + ("\n  /* v1.18.0 — Phase E S1: per-project BOQ store + point BOQ_DATA at the active project. */\n"
                       "  if (typeof migrateProjectBoq === 'function') { try { migrateProjectBoq(); } catch (e) { console.warn('boq migrate failed', e); } }\n"
                       "  if (typeof _repointBoqData === 'function') { try { _repointBoqData(); } catch (e) {} }")
src = must_replace(src, old_boot, new_boot, "boot BOQ migrate + re-point")

# ── 5. Settings intake card ──────────────────────────────────────────
settings_pane = '  <section class="module-pane" id="pane-settings">'
intake_card = (settings_pane + '\n'
               '    <div class="settings-card boq-intake-card">\n'
               '      <div class="settings-card-title">Add Project &amp; Import BOQ</div>\n'
               '      <div class="settings-card-sub">Create a project under a PD HQ and load its Bill of Quantities (XLSX / CSV / paste). Contract value is derived from the line items.</div>\n'
               '      <div id="boqIntakeHost">\u2014</div>\n'
               '    </div>\n')
src = must_replace(src, settings_pane, intake_card, "settings BOQ intake card")

# ── 6. switchModule render hook ──────────────────────────────────────
cmd_hook = "  if (mod === 'command' && typeof renderCommandCenter === 'function') renderCommandCenter();"
src = must_replace(src, cmd_hook,
                   cmd_hook + "\n  if (mod === 'settings' && typeof renderBoqIntake === 'function') renderBoqIntake();",
                   "switchModule settings hook")

# ── 7. CSS ───────────────────────────────────────────────────────────
intake_css = """
/* \u2500\u2500 Phase E S1 \u2014 BOQ intake \u2500\u2500 */
.boq-intake-card { grid-column: 1 / -1; }
.boq-intake-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.boq-intake-row label { width: 160px; font-size: 12px; color: var(--ink-2, #555); }
.boq-intake-row input[type=text], .boq-intake-row select { flex: 1; padding: 5px 8px; border: 1px solid var(--line, #ccc); border-radius: 5px; }
.boq-intake-or { text-align: center; font-size: 11px; color: var(--ink-3, #999); margin: 8px 0; }
.boq-intake-paste { width: 100%; min-height: 80px; font-family: monospace; font-size: 11px; border: 1px solid var(--line, #ccc); border-radius: 5px; padding: 6px; }
.boq-intake-actions { display: flex; gap: 8px; margin: 10px 0; }
.boq-intake-preview { margin-top: 8px; }
.boq-intake-summary { font-size: 12.5px; margin-bottom: 6px; }
.boq-intake-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.boq-intake-table th, .boq-intake-table td { padding: 3px 7px; border-bottom: 1px solid var(--line, #eee); text-align: left; }
.boq-intake-table th.num, .boq-intake-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.boq-intake-empty, .boq-intake-note { font-size: 11px; color: var(--ink-3, #999); font-style: italic; }

</style>"""
src = must_replace(src, "\n</style>", intake_css, "BOQ intake CSS")

# ── 8. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.17.0 (Phase D Session 5 \u2014 Portfolio merged)",
                   "NLC Unified Project Control \u00b7 v1.18.0 (Phase E Session 1 \u2014 Per-project BOQ import)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase E Session 1 merge complete → v1.18.0")
