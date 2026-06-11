#!/usr/bin/env python3
"""
PHASE C MERGER — Session 6: Access Control Foundation
======================================================
Applies the access-control foundation over v1.8.0 → produces v1.9.0.

Foundation only: per-project role membership + accessors + switcher
filtering + Settings matrix. Does NOT gate module renders / actions yet.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place, v1.8.0 → v1.9.0)
Embeds:       _org_access_module.js

Transforms (each must hit exactly once):
  1. Embed _org_access_module.js before the boot anchor
  2. Hook migrateAccessControl() into boot (after partitionProjectData)
  3. renderProjectSwitcher: filter to accessible projects (keep active visible)
  4. renderSettingsProjectsTab: inject access matrix (1-block insertion)
  5. Access matrix CSS before </style>
  6. Bump console banner v1.8.0 -> v1.9.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
ACCESS_JS = "_org_access_module.js"


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

with open(ACCESS_JS, 'r', encoding='utf-8') as f:
    access_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + access_js + "\n\n" + boot_anchor, "embed _org_access_module.js")

# ── 2. Hook migrateAccessControl into boot (after partition) ─────────
old_hook = ("  if (typeof partitionProjectData === 'function') {\n"
            "    try { partitionProjectData(); } catch (e) { console.warn('org partition failed', e); }\n"
            "  }")
new_hook = old_hook + ("\n  /* v1.9.0 — Phase C S6: idempotent access-control init. */\n"
                       "  if (typeof migrateAccessControl === 'function') {\n"
                       "    try { migrateAccessControl(); } catch (e) { console.warn('org access migrate failed', e); }\n"
                       "  }")
src = must_replace(src, old_hook, new_hook, "boot migrateAccessControl hook")

# ── 3. Switcher filters by accessibility (keep active visible) ───────
old_sw = "    const projs = getProjectsByPdHq(hq.id).filter(p => !p.archived);"
new_sw = ("    const projs = getProjectsByPdHq(hq.id).filter(p => !p.archived && "
          "(typeof canAccessProject !== 'function' || canAccessProject(p.id) || p.id === state.org.activeProjectId));")
src = must_replace(src, old_sw, new_sw, "renderProjectSwitcher access filter")

# ── 4. Inject access matrix into Settings (before add-project form) ──
old_settings_anchor = "  /* Add-project mini form (PD HQ select + name) */\n  let pdOpts = pdHqs.map"
new_settings_anchor = ("  /* S6 \u2014 Access control matrix (role \u00d7 project) */\n"
                       "  if (typeof renderAccessMatrixHtml === 'function') html += renderAccessMatrixHtml();\n\n"
                       "  /* Add-project mini form (PD HQ select + name) */\n  let pdOpts = pdHqs.map")
src = must_replace(src, old_settings_anchor, new_settings_anchor, "Settings access matrix injection")

# ── 5. Access matrix CSS ─────────────────────────────────────────────
access_css = """
/* \u2500\u2500 Phase C S6 \u2014 access control matrix \u2500\u2500 */
.org-access { margin-top: 14px; border-top: 1px dashed var(--line, #ddd); padding-top: 8px; }
.org-access-title { font-size: 11.5px; font-weight: 600; color: var(--ink-3, #888); margin-bottom: 6px; }
.org-access-wrap { overflow-x: auto; }
.org-access-table { border-collapse: collapse; font-size: 11px; }
.org-access-table th, .org-access-table td { padding: 3px 6px; border: 1px solid var(--line, #eee); text-align: center; }
.org-access-table th.oa-name, .org-access-table td.oa-name { text-align: left; font-weight: 500; white-space: nowrap; }
.org-access-table thead th { background: var(--bg-2, #f7f7f7); font-weight: 600; }

</style>"""
src = must_replace(src, "\n</style>", access_css, "access matrix CSS")

# ── 6. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.8.0 (Phase C Session 5)",
                   "NLC Unified Project Control \u00b7 v1.9.0 (Phase C Session 6)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase C Session 6 merge complete → v1.9.0")
