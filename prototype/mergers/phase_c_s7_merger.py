#!/usr/bin/env python3
"""
PHASE C MERGER — Session 7: Access Enforcement (read-only fallback)
====================================================================
Applies enforcement over v1.9.0 → produces v1.10.0.

Composes project×role access into the existing action×role gates. When
the current role can't access the active project: actions denied (canDo
false / requireRole toast), viewing allowed (read-only). admin bypasses.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place, v1.9.0 → v1.10.0)
Embeds:       _org_enforce_module.js

Transforms (each must hit exactly once):
  1. Embed _org_enforce_module.js before the boot anchor
  2. canDo: deny when active project inaccessible
  3. requireRole: deny (+toast) when active project inaccessible
  4. renderProjectSwitcher: append a read-only badge when inaccessible
  5. read-only badge CSS
  6. Bump console banner v1.9.0 -> v1.10.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
ENF_JS = "_org_enforce_module.js"


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

with open(ENF_JS, 'r', encoding='utf-8') as f:
    enf_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + enf_js + "\n\n" + boot_anchor, "embed _org_enforce_module.js")

# ── 2. canDo composition ─────────────────────────────────────────────
old_cando = ("function canDo(action) {\n"
             "  const role = state?.session?.role || 'qs';\n"
             "  const allowed = PERMISSIONS[action];")
new_cando = ("function canDo(action) {\n"
             "  const role = state?.session?.role || 'qs';\n"
             "  if (typeof _activeProjectAccessible === 'function' && !_activeProjectAccessible()) return false;   // S7 \u2014 project read-only\n"
             "  const allowed = PERMISSIONS[action];")
src = must_replace(src, old_cando, new_cando, "canDo project enforcement")

# ── 3. requireRole composition ───────────────────────────────────────
old_req = ("function requireRole(action, opts = { silent: false }) {\n"
           "  const role = state?.session?.role || 'qs';\n"
           "  const allowed = PERMISSIONS[action];")
new_req = ("function requireRole(action, opts = { silent: false }) {\n"
           "  const role = state?.session?.role || 'qs';\n"
           "  if (typeof _activeProjectAccessible === 'function' && !_activeProjectAccessible()) {   // S7 \u2014 project read-only\n"
           "    if (!opts.silent) { try { toast('Read-only: your role has no access to the active project', 'error'); } catch (e) {} }\n"
           "    return false;\n"
           "  }\n"
           "  const allowed = PERMISSIONS[action];")
src = must_replace(src, old_req, new_req, "requireRole project enforcement")

# ── 4. Switcher read-only badge ──────────────────────────────────────
old_sw = ("host.innerHTML =\n"
          "    '<span class=\"ctrl-label\">Project</span>' +\n"
          "    '<select id=\"projectSwitcherSelect\" onchange=\"switchActiveProject(this.value)\">' + opts + '</select>';")
new_sw = ("host.innerHTML =\n"
          "    '<span class=\"ctrl-label\">Project</span>' +\n"
          "    '<select id=\"projectSwitcherSelect\" onchange=\"switchActiveProject(this.value)\">' + opts + '</select>' +\n"
          "    ((typeof _activeProjectAccessible === 'function' && !_activeProjectAccessible()) ? '<span class=\"ro-badge\" title=\"Your role has no access to this project \u2014 read-only\">read-only</span>' : '');")
src = must_replace(src, old_sw, new_sw, "switcher read-only badge")

# ── 5. read-only badge CSS ───────────────────────────────────────────
ro_css = """
/* \u2500\u2500 Phase C S7 \u2014 read-only badge \u2500\u2500 */
.ro-badge { margin-left: 8px; font-size: 10px; font-weight: 600; color: #fff; background: #b23b3b; border-radius: 4px; padding: 1px 6px; vertical-align: middle; letter-spacing: 0.02em; }

</style>"""
src = must_replace(src, "\n</style>", ro_css, "read-only badge CSS")

# ── 6. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.9.0 (Phase C Session 6)",
                   "NLC Unified Project Control \u00b7 v1.10.0 (Phase C Session 7)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase C Session 7 merge complete → v1.10.0")
