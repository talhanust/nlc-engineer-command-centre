#!/usr/bin/env python3
"""
PHASE E MERGER — Session 4: Context-aware header (NLC Engineer Command Centre)
===============================================================================
Over v1.20.0 -> v1.21.0.

Embeds: _phase_e_s4_module.js

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Give the consultant/reference line an id (hdrProjectMeta)
  3. renderHeader: early-delegate to _renderHeaderImpl (old body kept as dead fallback)
  4. switchActiveProject: set activeNodeId = projId so the header follows any project pick
  5. Bump console banner v1.20.0 -> v1.21.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E4_JS = "_phase_e_s4_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
o_len, o_lines = len(src), src.count('\n')
print(f"Loaded {PATH}: {o_lines} lines, {o_len:,} chars")
with open(E4_JS, 'r', encoding='utf-8') as f:
    e4 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e4 + "\n\n" + boot_anchor, "embed e4 module")

# 2. id on the consultant/reference line
src = must_replace(src,
                   '<div class="t3">Consultant: Osmani &amp; Company Pvt Ltd · Reference: MRS 2H-2025</div>',
                   '<div class="t3" id="hdrProjectMeta">Consultant: Osmani &amp; Company Pvt Ltd · Reference: MRS 2H-2025</div>',
                   "hdrProjectMeta id")

# 3. early-delegate in renderHeader (preserves the single declaration; old body becomes dead fallback)
src = must_replace(src,
                   "function renderHeader() {\n  const p = getActiveProject();",
                   "function renderHeader() {\n  if (typeof _renderHeaderImpl === 'function') { _renderHeaderImpl(); return; }   // Phase E S4 — context-aware header\n  const p = getActiveProject();",
                   "renderHeader delegate")

# 4. switchActiveProject: header follows the picked project
src = must_replace(src,
                   "  state.org.activeProjectId = projId;",
                   "  state.org.activeProjectId = projId;\n  if (state.org) state.org.activeNodeId = projId;   // Phase E S4 — header follows the picked project",
                   "switchActiveProject activeNodeId")

# 4b. same-project early-return path must also set the active node
src = must_replace(src,
                   "if (before === projId) { renderProjectSwitcher(); renderHeader(); return true; }",
                   "if (before === projId) { if (state.org) state.org.activeNodeId = projId; renderProjectSwitcher(); renderHeader(); return true; }",
                   "switchActiveProject early-return activeNodeId")

# 5. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.20.0 (Phase E Session 3 \u2014 Demo data seeder)",
                   "NLC Unified Project Control \u00b7 v1.21.0 (Phase E Session 4 \u2014 Command-centre header)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
n_len, n_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {n_lines} lines (+{n_lines - o_lines}), {n_len:,} chars (+{n_len - o_len:,})")
print("Phase E Session 4 merge complete → v1.21.0")
