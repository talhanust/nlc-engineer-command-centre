#!/usr/bin/env python3
"""
PHASE E MERGER — Session 23: Project-leaf comments panel
=========================================================
Over v1.39.0 -> v1.40.0.

Embeds: _phase_e_s23_module.js

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Comments host on the Executive pane (after its section-head)
  3. refreshAll hook (render project comments after the filter bar)
  4. Small spacing CSS
  5. Bump console banner v1.39.0 -> v1.40.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E23_JS = "_phase_e_s23_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E23_JS, 'r', encoding='utf-8') as f:
    e23 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e23 + "\n\n" + boot_anchor, "embed e23 module")

# 2. host after the Executive pane section-head
exec_head = ('<div class="section-subtitle">Synthesis view \u2014 twin S-curve, EVM, watch list, heat strip \u00b7 Phase 2 deliverable</div>\n'
             '      </div>\n'
             '    </div>')
src = must_replace(src, exec_head,
                   exec_head + '\n    <div id="projectCommentsHost" class="project-comments"></div>',
                   "project comments host")

# 3. refreshAll hook (after the filter bar render)
fb_hook = "  if (typeof renderFilterBar === 'function') renderFilterBar();"
src = must_replace(src, fb_hook,
                   fb_hook + "\n  if (typeof renderProjectComments === 'function') renderProjectComments();",
                   "refreshAll project-comments hook")

# 4. CSS
pc_css = """
/* \u2500\u2500 Phase E S23 \u2014 project comments host \u2500\u2500 */
.project-comments:empty { display: none; }
.project-comments { margin: 4px 0 18px; }

</style>"""
src = must_replace(src, "\n</style>", pc_css, "project comments CSS")

# 5. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.39.0 (Phase E Session 22 \u2014 Node comments)",
                   "NLC Unified Project Control \u00b7 v1.40.0 (Phase E Session 23 \u2014 Project comments)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 23 merge complete → v1.40.0")
