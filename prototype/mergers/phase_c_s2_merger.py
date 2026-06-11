#!/usr/bin/env python3
"""
PHASE C MERGER — Session 2: Per-Project Data Partitioning
==========================================================
Applies the partitioning delta over v1.4.0 → produces v1.5.0.

Model: active working-set + per-project stash (locked). Zero of the ~936
existing slice references change; only switch/add/boot-migration touch
partitions. Portfolio rollup is deferred to Session 3.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place, v1.4.0 → v1.5.0)
Embeds:       _org_data_module.js

Transforms (each must hit exactly once):
  1. Embed _org_data_module.js before the boot DOMContentLoaded anchor
  2. Replace S1 switchActiveProject with the swap-aware S2 version
  3. addProject: initialise new project's data stash (empty slices)
  4. Hook partitionProjectData() into boot (after migrateToOrgTree)
  5. Bump console banner v1.4.0 (S1) -> v1.5.0 (S2)
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
DATA_JS = "_org_data_module.js"


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

with open(DATA_JS, 'r', encoding='utf-8') as f:
    data_js = f.read()

# ── 1. Embed _org_data_module.js before boot anchor ──────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + data_js + "\n\n" + boot_anchor, "embed _org_data_module.js")

# ── 2. Swap-aware switchActiveProject ────────────────────────────────
old_switch = (
"function switchActiveProject(projId) {\n"
"  if (!state.org || !state.org.projects[projId]) return false;\n"
"  const before = state.org.activeProjectId;\n"
"  if (before === projId) { renderProjectSwitcher(); renderHeader(); return true; }\n"
"  state.org.activeProjectId = projId;\n"
"  audit('org.project.switch', 'org', projId, { activeProjectId: before }, { activeProjectId: projId }, 'Active project switched');\n"
"  saveState();\n"
"  /* Re-render dependent UI (header + switcher; full refresh if available). */\n"
"  renderProjectSwitcher();\n"
"  renderHeader();\n"
"  if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) { /* non-fatal in tests */ } }\n"
"  return true;\n"
"}"
)
new_switch = (
"function switchActiveProject(projId) {\n"
"  if (!state.org || !state.org.projects[projId]) return false;\n"
"  const before = state.org.activeProjectId;\n"
"  if (before === projId) { renderProjectSwitcher(); renderHeader(); return true; }\n"
"  /* Phase C S2 — stash outgoing project's working set, hydrate incoming. */\n"
"  if (before && state.org.projects[before]) {\n"
"    state.org.projects[before].data = _extractWorkingSet();\n"
"  }\n"
"  _applyWorkingSet(state.org.projects[projId].data);\n"
"  state.org.projects[projId].data = null;        // now live in working set\n"
"  state.org.activeProjectId = projId;\n"
"  /* Backfill any missing slice fields on the freshly-hydrated working set. */\n"
"  if (typeof ensureProcurementState === 'function') { try { ensureProcurementState(); } catch (e) {} }\n"
"  if (typeof ensureFinancialState === 'function')  { try { ensureFinancialState();  } catch (e) {} }\n"
"  audit('org.project.switch', 'org', projId, { activeProjectId: before }, { activeProjectId: projId }, 'Active project switched (data partition swapped)');\n"
"  saveState();\n"
"  renderProjectSwitcher();\n"
"  renderHeader();\n"
"  if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) { /* non-fatal in tests */ } }\n"
"  return true;\n"
"}"
)
src = must_replace(src, old_switch, new_switch, "swap-aware switchActiveProject")

# ── 3. addProject initialises empty data stash ───────────────────────
old_add = "  state.org.projects[id] = proj;\n  audit('org.project.add'"
new_add = "  proj.data = _emptyDataSlices();\n  state.org.projects[id] = proj;\n  audit('org.project.add'"
src = must_replace(src, old_add, new_add, "addProject data stash init")

# ── 4. Hook partitionProjectData into boot ───────────────────────────
old_hook = ("  if (typeof migrateToOrgTree === 'function') {\n"
            "    try { migrateToOrgTree(); } catch (e) { console.warn('org migrate failed', e); }\n"
            "  }")
new_hook = old_hook + ("\n  /* v1.5.0 — Phase C S2: idempotent per-project data partitioning. */\n"
                       "  if (typeof partitionProjectData === 'function') {\n"
                       "    try { partitionProjectData(); } catch (e) { console.warn('org partition failed', e); }\n"
                       "  }")
src = must_replace(src, old_hook, new_hook, "boot partitionProjectData hook")

# ── 5. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.4.0 (Phase C Session 1)",
                   "NLC Unified Project Control \u00b7 v1.5.0 (Phase C Session 2)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase C Session 2 merge complete → v1.5.0")
