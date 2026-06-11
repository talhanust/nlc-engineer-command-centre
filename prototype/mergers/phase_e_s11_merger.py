#!/usr/bin/env python3
"""
PHASE E MERGER — Session 11: Adjustable RAG thresholds
=======================================================
Over v1.27.0 -> v1.28.0.

Embeds: _phase_e_s11_module.js
(_healthFromTotals / nodeHealth now read _ragThresholds() — those edits live in
_phase_e_s8_module.js, re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Settings "RAG Risk Thresholds" card before the salients card
  3. switchModule: render the RAG settings when entering Settings
  4. Slider CSS
  5. Bump console banner v1.27.0 -> v1.28.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E11_JS = "_phase_e_s11_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
o_len = len(src)
print(f"Loaded {PATH}: {o_len:,} chars")
with open(E11_JS, 'r', encoding='utf-8') as f:
    e11 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e11 + "\n\n" + boot_anchor, "embed e11 module")

# 2. settings RAG card before the salients card
sal_card = '<div class="settings-card salients-card">'
rag_card = ('<div class="settings-card ragcfg-card">\n'
            '      <div class="settings-card-title">RAG Risk Thresholds</div>\n'
            '      <div class="settings-card-sub">Tune the amber/red cut-offs for collection, receivables and schedule slippage. Changes recolour every dashboard, breadcrumb and brief instantly.</div>\n'
            '      <div id="ragHost">\u2014</div>\n'
            '    </div>\n    ' + sal_card)
src = must_replace(src, sal_card, rag_card, "settings RAG card")

# 3. switchModule hook (after the salients hook)
sal_hook = "  if (mod === 'settings' && typeof renderSalientsEditor === 'function') renderSalientsEditor();"
src = must_replace(src, sal_hook,
                   sal_hook + "\n  if (mod === 'settings' && typeof renderRagSettings === 'function') renderRagSettings();",
                   "switchModule RAG hook")

# 4. CSS
rag_css = """
/* \u2500\u2500 Phase E S11 \u2014 RAG threshold sliders \u2500\u2500 */
.ragcfg-card { grid-column: 1 / -1; }
.rag-cfg-group { margin-bottom: 10px; }
.rag-cfg-h { font-size: 12px; font-weight: 600; color: var(--ink-2, #44506a); margin-bottom: 4px; }
.rag-cfg-row { display: flex; align-items: center; gap: 10px; margin: 3px 0; }
.rag-cfg-row label { width: 90px; font-size: 11.5px; color: var(--ink-2, #555); }
.rag-cfg-row input[type=range] { flex: 1; max-width: 280px; }
.rag-cfg-val { width: 42px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; }
.rag-cfg-hint { font-size: 11px; color: var(--ink-3, #99a3b2); font-style: italic; }

</style>"""
src = must_replace(src, "\n</style>", rag_css, "RAG slider CSS")

# 5. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.27.0 (Phase E Session 10 \u2014 Enriched export brief)",
                   "NLC Unified Project Control \u00b7 v1.28.0 (Phase E Session 11 \u2014 Adjustable RAG thresholds)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 11 merge complete → v1.28.0")
