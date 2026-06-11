#!/usr/bin/env python3
"""
PHASE E MERGER — Session 3: Hypothetical demo-data seeder
==========================================================
Over v1.19.0 -> v1.20.0.

Embeds: _phase_e_s3_module.js

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Settings: demo-data card before the baseline intake card
  3. switchModule: render demo controls when entering Settings
  4. Demo card CSS
  5. Bump console banner v1.19.0 -> v1.20.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E3_JS = "_phase_e_s3_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
o_len, o_lines = len(src), src.count('\n')
print(f"Loaded {PATH}: {o_lines} lines, {o_len:,} chars")
with open(E3_JS, 'r', encoding='utf-8') as f:
    e3 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e3 + "\n\n" + boot_anchor, "embed e3 module")

# 2. settings demo card (before the baseline intake card)
baseline_card = '<div class="settings-card baseline-intake-card">'
demo_card = ('<div class="settings-card demo-data-card">\n'
             '      <div class="settings-card-title">Demo Data</div>\n'
             '      <div class="settings-card-sub">Populate the system with hypothetical projects across every PD HQ to explore the command hierarchy, portfolio and roll-ups end to end.</div>\n'
             '      <div id="demoHost">\u2014</div>\n'
             '    </div>\n    ' + baseline_card)
src = must_replace(src, baseline_card, demo_card, "settings demo card")

# 3. switchModule render hook (after the baseline hook)
baseline_hook = "  if (mod === 'settings' && typeof renderBaselineIntake === 'function') renderBaselineIntake();"
src = must_replace(src, baseline_hook,
                   baseline_hook + "\n  if (mod === 'settings' && typeof renderDemoControls === 'function') renderDemoControls();",
                   "switchModule demo hook")

# 4. CSS
demo_css = """
/* \u2500\u2500 Phase E S3 \u2014 demo data \u2500\u2500 */
.demo-data-card { grid-column: 1 / -1; }
.demo-status { font-size: 12.5px; color: var(--ink-2, #555); margin-bottom: 8px; }
.btn.btn-danger { background: var(--status-rejected, #c0392b); color: #fff; border-color: transparent; }

</style>"""
src = must_replace(src, "\n</style>", demo_css, "demo data CSS")

# 5. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.19.0 (Phase E Session 2 \u2014 Per-project baselines)",
                   "NLC Unified Project Control \u00b7 v1.20.0 (Phase E Session 3 \u2014 Demo data seeder)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
n_len, n_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {n_lines} lines (+{n_lines - o_lines}), {n_len:,} chars (+{n_len - o_len:,})")
print("Phase E Session 3 merge complete → v1.20.0")
