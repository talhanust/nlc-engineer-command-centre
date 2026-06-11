#!/usr/bin/env python3
"""
PHASE C MERGER — Session 9 (closeout): Project Hard Delete
===========================================================
Applies hard delete over v1.11.0 → produces v1.12.0. Archived-only,
irreversible. Clears the last item on the deferred backlog.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place, v1.11.0 → v1.12.0)
Embeds:       _org_delete_module.js

Transforms (each must hit exactly once):
  1. Embed _org_delete_module.js before the boot anchor
  2. Add a Delete button to each archived-project row in Settings
  3. Delete button CSS
  4. Bump console banner v1.11.0 -> v1.12.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
DEL_JS = "_org_delete_module.js"


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

with open(DEL_JS, 'r', encoding='utf-8') as f:
    del_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + del_js + "\n\n" + boot_anchor, "embed _org_delete_module.js")

# ── 2. Delete button in archived rows ────────────────────────────────
old_arch = ("              '<button class=\"org-restore-btn\" title=\"Restore project\" onclick=\"restoreProject(\\'' + esc(pr.id) + '\\')\">Restore</button>' +\n"
            "              '</li>';")
new_arch = ("              '<button class=\"org-restore-btn\" title=\"Restore project\" onclick=\"restoreProject(\\'' + esc(pr.id) + '\\')\">Restore</button>' +\n"
            "              '<button class=\"org-delete-btn\" title=\"Permanently delete (irreversible)\" onclick=\"if(confirm(\\'Permanently DELETE this archived project and ALL its data? This cannot be undone.\\'))hardDeleteProject(\\'' + esc(pr.id) + '\\')\">Delete</button>' +\n"
            "              '</li>';")
src = must_replace(src, old_arch, new_arch, "archived-row Delete button")

# ── 3. Delete button CSS ─────────────────────────────────────────────
del_css = """
/* \u2500\u2500 Phase C S9 \u2014 hard-delete button \u2500\u2500 */
.org-delete-btn { margin-left: 8px; font-size: 10.5px; padding: 1px 8px; border-radius: 4px; cursor: pointer; border: 1px solid #d98080; background: #fff; color: #b23b3b; font-weight: 600; }
.org-delete-btn:hover { background: #b23b3b; color: #fff; border-color: #b23b3b; }

</style>"""
src = must_replace(src, "\n</style>", del_css, "delete button CSS")

# ── 4. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.11.0 (Phase C Session 8)",
                   "NLC Unified Project Control \u00b7 v1.12.0 (Phase C Session 9 \u2014 closeout)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase C Session 9 merge complete → v1.12.0")
