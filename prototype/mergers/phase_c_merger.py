#!/usr/bin/env python3
"""
PHASE C MERGER — Session 1: Org Tree Foundation
================================================
Applies the org-tree delta over the CURRENT v1.3.7 build → produces v1.4.0.

WHY A SEPARATE MERGER (not editing phase_a/phase_b):
  phase_a_merger.py and phase_b_merger.py operate on the pre-Phase-A v1.1.0
  baseline (their anchors, e.g. the 11-role ROLES block, no longer exist in
  v1.3.7). That baseline is not available, so they cannot be re-run. This
  merger is the verifiable forward delta over the artifact we actually have
  (the v1.3.7 HTML), using the same strict assert/replace discipline.

Reads:  FGEHA_NLC_F14F15_UnifiedControl_v1_0.html  (v1.3.7, in place)
Embeds: _org_module.js
Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html  (v1.4.0, in place)

Transforms (each must hit exactly once):
  1. Embed _org_module.js before the boot DOMContentLoaded anchor
  2. Hook migrateToOrgTree() into boot (after ensureFinancialState)
  3. Replace static t1/t2 header divs with id'd, render-driven divs
  4. Insert top-bar project switcher after the Role control
  5. Change appName constant -> 'NLC Unified Project Control'
  6. Wrap EPC subtitle client token in #epcClientLabel span
  7. Wrap reconciliation subtitle client token in #reconClientLabel span
  8. Insert Settings -> Projects card before the Audit Log card
  9. Insert org CSS before </style>
 10. Hook org renders into refreshAll (after refreshHeader / refreshSettings)
 11. Bump boot banner v1.3.7 (Financial) -> v1.4.0 (Phase C Session 1)
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
ORG_JS = "_org_module.js"


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

with open(ORG_JS, 'r', encoding='utf-8') as f:
    org_js = f.read()

# ── 1. Embed _org_module.js before boot anchor ───────────────────────
old_boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
new_boot_anchor = "\n" + org_js + "\n\ndocument.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, old_boot_anchor, new_boot_anchor, "embed _org_module.js")

# ── 2. Hook migrateToOrgTree into boot (after ensureFinancialState) ───
old_boot_ensure = "  const { fresh } = loadState();\n  ensureProcurementState();\n  ensureFinancialState();"
new_boot_ensure = old_boot_ensure + (
    "\n  /* v1.4.0 — Phase C S1: idempotent org-tree migration. Seeds NLC tree\n"
    "     and migrates existing F-14/F-15 into HQ PD North. Safe to run every boot. */\n"
    "  if (typeof migrateToOrgTree === 'function') {\n"
    "    try { migrateToOrgTree(); } catch (e) { console.warn('org migrate failed', e); }\n"
    "  }"
)
src = must_replace(src, old_boot_ensure, new_boot_ensure, "boot migrateToOrgTree hook")

# ── 3. Parameterized header (replace static t1/t2 divs) ───────────────
old_header = ('        <div class="t1">FGEHA \u00d7 NLC \u00b7 Unified Project Control</div>\n'
              '        <div class="t2">F-14/15 Islamabad \u2014 Infrastructure Development</div>')
new_header = ('        <div class="t1" id="hdrProjectTitle">FGEHA \u00d7 NLC \u00b7 Unified Project Control</div>\n'
              '        <div class="t2" id="hdrProjectSubtitle">F-14/15 Islamabad \u2014 Infrastructure Development</div>')
src = must_replace(src, old_header, new_header, "parameterized header divs")

# ── 4. Top-bar project switcher (after Role control) ──────────────────
old_role_ctrl = ('      <div class="ctrl">\n'
                 '        <span class="ctrl-label">Role</span>\n'
                 '        <select id="hdrRole" onchange="setSessionRole(this.value)"></select>\n'
                 '      </div>')
new_role_ctrl = old_role_ctrl + '\n      <div class="ctrl" id="projectSwitcherHost"></div>'
src = must_replace(src, old_role_ctrl, new_role_ctrl, "project switcher host")

# ── 5. appName constant ───────────────────────────────────────────────
src = must_replace(src,
                   "appName:              'FGEHA \u00d7 NLC Unified Project Control',",
                   "appName:              'NLC Unified Project Control',",
                   "appName constant")

# ── 6. EPC subtitle client token ──────────────────────────────────────
src = must_replace(src,
                   "for the main contract (FGEHA \u2192 NLC)",
                   "for the main contract (<span id=\"epcClientLabel\">FGEHA</span> \u2192 NLC)",
                   "EPC subtitle client token")

# ── 7. Reconciliation subtitle client token ───────────────────────────
src = must_replace(src,
                   "Compare what NLC bills FGEHA (IPCs)",
                   "Compare what NLC bills <span id=\"reconClientLabel\">FGEHA</span> (IPCs)",
                   "reconciliation subtitle client token")

# ── 8. Settings -> Projects card (before Audit Log card) ──────────────
old_audit_card = ('      <div class="settings-card" style="grid-column: 1 / -1;">\n'
                  '        <h4>Audit Log (recent 10)</h4>')
projects_card = (
    '      <div class="settings-card" style="grid-column: 1 / -1;">\n'
    '        <h4>Projects (Org Tree) <span style="font-weight:400;font-size:11px;color:var(--ink-3);">'
    '\u2014 NLC HQ \u2192 HQ Engrs \u2192 5 PD HQs \u2192 projects</span></h4>\n'
    '        <div id="dxProjectsTree">\u2014</div>\n'
    '      </div>\n\n'
)
src = must_replace(src, old_audit_card, projects_card + old_audit_card, "Settings Projects card")

# ── 9. Org CSS (before </style>) ──────────────────────────────────────
org_css = """
/* ── Phase C S1 — Org tree / project switcher ── */
#projectSwitcherHost select { min-width: 180px; }
.org-tree { display: flex; flex-direction: column; gap: 8px; }
.org-hq { border: 1px solid var(--line, #e2e2e2); border-radius: 6px; padding: 8px 10px; }
.org-hq-name { font-weight: 600; font-size: 12.5px; color: var(--ink-1, #1e3a5f); }
.org-count { font-weight: 400; color: var(--ink-3, #888); font-size: 11px; }
.org-proj-list { list-style: none; margin: 6px 0 0; padding: 0; }
.org-proj-list li { display: flex; justify-content: space-between; gap: 12px;
  padding: 4px 0; border-top: 1px dashed var(--line, #eee); font-size: 12px; }
.org-proj-name { font-weight: 500; }
.org-proj-meta { color: var(--ink-3, #888); font-size: 11px; text-align: right; }
.org-empty { color: var(--ink-3, #aaa); font-size: 11px; font-style: italic; padding-top: 4px; }
.org-add-form { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: center; }
.org-add-form input { flex: 1; min-width: 180px; }

</style>"""
src = must_replace(src, "\n</style>", org_css, "org CSS")

# ── 10. Hook org renders into refreshAll ──────────────────────────────
old_refresh = "function refreshAll() {\n  refreshHeader();\n  refreshRoleSelect();"
new_refresh = ("function refreshAll() {\n  refreshHeader();\n"
               "  if (typeof renderHeader === 'function') renderHeader();\n"
               "  if (typeof renderProjectSwitcher === 'function') renderProjectSwitcher();\n"
               "  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();\n"
               "  refreshRoleSelect();")
src = must_replace(src, old_refresh, new_refresh, "refreshAll org render hook")

# ── 11. Boot banner bump ──────────────────────────────────────────────
src = must_replace(src,
                   "FGEHA \u00d7 NLC Unified Project Control \u00b7 v1.3.7 (Financial)",
                   "NLC Unified Project Control \u00b7 v1.4.0 (Phase C Session 1)",
                   "boot banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)

new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase C Session 1 merge complete → v1.4.0")
