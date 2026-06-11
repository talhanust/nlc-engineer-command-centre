#!/usr/bin/env python3
"""
PHASE D MERGER — Session 4: Access-scoped rollups
==================================================
Over v1.15.0 -> v1.16.0. Branch roll-ups / child list / navigator only
include projects the current role can access (admin bypass; permissive
default keeps existing behaviour identical when all roles are permitted).

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place)
Embeds:       _phase_d_s4_module.js

Transforms (each must hit exactly once):
  1. Embed _phase_d_s4_module.js before the boot anchor
  2. _projectsUnderNode: filter by _accessibleProject
  3. _immediateChildNodes: filter project leaves by _accessibleProject
  4. renderOrgNavigator: filter project leaves by _accessibleProject
  5. Bump console banner v1.15.0 -> v1.16.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
S4_JS = "_phase_d_s4_module.js"


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

with open(S4_JS, 'r', encoding='utf-8') as f:
    s4_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + s4_js + "\n\n" + boot_anchor, "embed s4 module")

# ── 2. _projectsUnderNode access scope ───────────────────────────────
old_pun = """function _projectsUnderNode(nodeId) {
  if (state.org && state.org.projects[nodeId]) {
    const p = state.org.projects[nodeId];
    return p.archived ? [] : [p];
  }
  const pdIds = _subtreePdHqIds(nodeId);
  return Object.values(state.org.projects).filter(p => !p.archived && pdIds.indexOf(p.pdHqId) !== -1);
}"""
new_pun = """function _projectsUnderNode(nodeId) {
  if (state.org && state.org.projects[nodeId]) {
    const p = state.org.projects[nodeId];
    return (p.archived || !_accessibleProject(p)) ? [] : [p];
  }
  const pdIds = _subtreePdHqIds(nodeId);
  return Object.values(state.org.projects).filter(p => !p.archived && pdIds.indexOf(p.pdHqId) !== -1 && _accessibleProject(p));
}"""
src = must_replace(src, old_pun, new_pun, "_projectsUnderNode access scope")

# ── 3. _immediateChildNodes access scope ─────────────────────────────
old_icn = """  if (n.type === 'pd_hq') {
    return Object.values(state.org.projects)
      .filter(p => !p.archived && p.pdHqId === nodeId)
      .map(p => ({ id: p.id, name: p.name, type: 'project', pdHqId: p.pdHqId }));
  }"""
new_icn = """  if (n.type === 'pd_hq') {
    return Object.values(state.org.projects)
      .filter(p => !p.archived && p.pdHqId === nodeId && _accessibleProject(p))
      .map(p => ({ id: p.id, name: p.name, type: 'project', pdHqId: p.pdHqId }));
  }"""
src = must_replace(src, old_icn, new_icn, "_immediateChildNodes access scope")

# ── 4. renderOrgNavigator access scope ───────────────────────────────
old_nav = """      Object.values(state.org.projects)
        .filter(p => !p.archived && p.pdHqId === n.id)
        .forEach(p => {"""
new_nav = """      Object.values(state.org.projects)
        .filter(p => !p.archived && p.pdHqId === n.id && _accessibleProject(p))
        .forEach(p => {"""
src = must_replace(src, old_nav, new_nav, "renderOrgNavigator access scope")

# ── 5. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.15.0 (Phase D Session 3 \u2014 Consolidated Registers)",
                   "NLC Unified Project Control \u00b7 v1.16.0 (Phase D Session 4 \u2014 Access-scoped Rollups)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase D Session 4 merge complete → v1.16.0")
