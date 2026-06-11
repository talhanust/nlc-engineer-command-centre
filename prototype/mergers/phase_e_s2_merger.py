#!/usr/bin/env python3
"""
PHASE E MERGER — Session 2: Per-project baselines (S-curve + schedule) + live wiring
=====================================================================================
Over v1.18.0 -> v1.19.0.

Embeds: _phase_e_s2_module.js

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. const SCURVE_BASELINE -> let SCURVE_BASELINE
  3. const BASELINE_DATA   -> let BASELINE_DATA
  4. switchActiveProject: re-point baselines after the S1 BOQ re-point line
  5. boot: migrate baselines + re-point (after the S1 BOQ boot block)
  6. Settings: baseline intake card before the BOQ intake card
  7. switchModule: render baseline intake when entering Settings
  8. Baseline intake CSS
  9. Bump console banner v1.18.0 -> v1.19.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E2_JS = "_phase_e_s2_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
o_len, o_lines = len(src), src.count('\n')
print(f"Loaded {PATH}: {o_lines} lines, {o_len:,} chars")
with open(E2_JS, 'r', encoding='utf-8') as f:
    e2 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e2 + "\n\n" + boot_anchor, "embed e2 module")

# 2/3. const -> let
src = must_replace(src, "const SCURVE_BASELINE = [", "let SCURVE_BASELINE = [   // Phase E S2 — re-pointed per project", "SCURVE_BASELINE const->let")
src = must_replace(src, "const BASELINE_DATA = [", "let BASELINE_DATA = [   // Phase E S2 — re-pointed per project", "BASELINE_DATA const->let")

# 4. switchActiveProject baseline re-point (after the S1 BOQ re-point line)
boq_sw = "  if (typeof _repointBoqData === 'function') _repointBoqData();   // Phase E S1 — per-project BOQ"
src = must_replace(src, boq_sw,
                   boq_sw + "\n  if (typeof _repointBaselines === 'function') _repointBaselines();   // Phase E S2 — per-project baselines",
                   "switchActiveProject baseline re-point")

# 5. boot migrate + re-point (after the S1 BOQ boot block)
boq_boot = "  if (typeof _repointBoqData === 'function') { try { _repointBoqData(); } catch (e) {} }"
src = must_replace(src, boq_boot,
                   boq_boot + ("\n  /* v1.19.0 — Phase E S2: per-project baselines (S-curve + schedule). */\n"
                               "  if (typeof migrateProjectBaselines === 'function') { try { migrateProjectBaselines(); } catch (e) { console.warn('baseline migrate failed', e); } }\n"
                               "  if (typeof _repointBaselines === 'function') { try { _repointBaselines(); } catch (e) {} }"),
                   "boot baseline migrate + re-point")

# 6. settings baseline card (injected before the BOQ intake card)
boq_card = '<div class="settings-card boq-intake-card">'
baseline_card = ('<div class="settings-card baseline-intake-card">\n'
                 '      <div class="settings-card-title">Import Baseline Plans</div>\n'
                 '      <div class="settings-card-sub">Load a project\u2019s planned progress S-curve and/or schedule (XLSX / CSV / paste). Both become per-project and drive that project\u2019s charts.</div>\n'
                 '      <div id="baselineIntakeHost">\u2014</div>\n'
                 '    </div>\n    ' + boq_card)
src = must_replace(src, boq_card, baseline_card, "settings baseline card")

# 7. switchModule render hook (after the S1 settings hook)
boq_hook = "  if (mod === 'settings' && typeof renderBoqIntake === 'function') renderBoqIntake();"
src = must_replace(src, boq_hook,
                   boq_hook + "\n  if (mod === 'settings' && typeof renderBaselineIntake === 'function') renderBaselineIntake();",
                   "switchModule baseline hook")

# 8. CSS
baseline_css = """
/* \u2500\u2500 Phase E S2 \u2014 baseline intake \u2500\u2500 */
.baseline-intake-card { grid-column: 1 / -1; }
.baseline-cols { display: flex; gap: 16px; margin: 8px 0; }
.baseline-col { flex: 1; min-width: 0; }
.baseline-col-h { font-size: 12.5px; font-weight: 600; margin-bottom: 6px; }
.baseline-col-h span { font-weight: 400; color: var(--ink-3, #999); font-size: 11px; }
.baseline-col input[type=file] { display: block; margin-bottom: 6px; }
.baseline-col .boq-intake-paste { min-height: 64px; margin-bottom: 6px; }

</style>"""
src = must_replace(src, "\n</style>", baseline_css, "baseline intake CSS")

# 9. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.18.0 (Phase E Session 1 \u2014 Per-project BOQ import)",
                   "NLC Unified Project Control \u00b7 v1.19.0 (Phase E Session 2 \u2014 Per-project baselines)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
n_len, n_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {n_lines} lines (+{n_lines - o_lines}), {n_len:,} chars (+{n_len - o_len:,})")
print("Phase E Session 2 merge complete → v1.19.0")
