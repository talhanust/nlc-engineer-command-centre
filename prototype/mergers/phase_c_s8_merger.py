#!/usr/bin/env python3
"""
PHASE C MERGER — Session 8: Per-Project Approval-Chain Routing
===============================================================
Applies approval-chain routing over v1.10.0 → produces v1.11.0.

Per-project sparse overrides of which roles perform each permissioned
action; canDo/requireRole consult getActionRoles() which falls through to
the global PERMISSIONS when unset (so default behaviour is unchanged).
admin always retained. Editor exposes ALL permissioned actions.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place, v1.10.0 → v1.11.0)
Embeds:       _org_chain_module.js

Transforms (each must hit exactly once):
  1. Embed _org_chain_module.js before the boot anchor
  2. canDo: consult getActionRoles() instead of PERMISSIONS[action]
  3. requireRole: consult getActionRoles() instead of PERMISSIONS[action]
  4. Inject approval-chain editor into Settings (after the access matrix)
  5. Approval-chain editor CSS
  6. Bump console banner v1.10.0 -> v1.11.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
CHAIN_JS = "_org_chain_module.js"


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

with open(CHAIN_JS, 'r', encoding='utf-8') as f:
    chain_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + chain_js + "\n\n" + boot_anchor, "embed _org_chain_module.js")

# ── 2. canDo consults getActionRoles (anchored on the S7 2-line combo) ─
old_cando = ("  if (typeof _activeProjectAccessible === 'function' && !_activeProjectAccessible()) return false;   // S7 \u2014 project read-only\n"
             "  const allowed = PERMISSIONS[action];")
new_cando = ("  if (typeof _activeProjectAccessible === 'function' && !_activeProjectAccessible()) return false;   // S7 \u2014 project read-only\n"
             "  const allowed = (typeof getActionRoles === 'function') ? getActionRoles(action) : PERMISSIONS[action];   // S8 \u2014 per-project chain")
src = must_replace(src, old_cando, new_cando, "canDo getActionRoles")

# ── 3. requireRole consults getActionRoles (anchored on S7 block tail) ─
old_req = ("    return false;\n"
           "  }\n"
           "  const allowed = PERMISSIONS[action];")
new_req = ("    return false;\n"
           "  }\n"
           "  const allowed = (typeof getActionRoles === 'function') ? getActionRoles(action) : PERMISSIONS[action];   // S8 \u2014 per-project chain")
src = must_replace(src, old_req, new_req, "requireRole getActionRoles")

# ── 4. Inject editor into Settings (after the S6 access matrix) ──────
old_inject = ("  /* S6 \u2014 Access control matrix (role \u00d7 project) */\n"
              "  if (typeof renderAccessMatrixHtml === 'function') html += renderAccessMatrixHtml();")
new_inject = old_inject + ("\n\n  /* S8 \u2014 Per-project approval-chain editor */\n"
                           "  if (typeof renderApprovalChainHtml === 'function') html += renderApprovalChainHtml();")
src = must_replace(src, old_inject, new_inject, "Settings approval-chain injection")

# ── 5. Editor CSS ────────────────────────────────────────────────────
chain_css = """
/* \u2500\u2500 Phase C S8 \u2014 approval-chain editor \u2500\u2500 */
.org-chain { margin-top: 14px; border-top: 1px dashed var(--line, #ddd); padding-top: 8px; }
.org-chain-title { font-size: 11.5px; font-weight: 600; color: var(--ink-3, #888); margin-bottom: 6px; }
.org-chain-sub { font-weight: 400; font-size: 10px; }
.org-chain-wrap { overflow: auto; max-height: 360px; border: 1px solid var(--line, #eee); border-radius: 6px; }
.org-chain-table { border-collapse: collapse; font-size: 10.5px; }
.org-chain-table th, .org-chain-table td { padding: 2px 6px; border: 1px solid var(--line, #f0f0f0); text-align: center; white-space: nowrap; }
.org-chain-table th { position: sticky; top: 0; background: var(--bg-2, #f7f7f7); z-index: 1; }
.org-chain-table td.oc-act, .org-chain-table th.oc-act { text-align: left; font-weight: 500; }
.org-chain-table tr.oc-group td { text-align: left; font-weight: 700; background: var(--bg-1, #fbfbfb); color: var(--accent, #1e6fd9); text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.04em; }
.org-chain-table tr.oc-ov td.oc-act { color: #b23b3b; }
.oc-badge { font-size: 8.5px; font-weight: 700; color: #fff; background: #b23b3b; border-radius: 3px; padding: 0 4px; }
.oc-reset { border: none; background: none; cursor: pointer; font-size: 13px; color: var(--accent, #1e6fd9); }

</style>"""
src = must_replace(src, "\n</style>", chain_css, "approval-chain CSS")

# ── 6. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.10.0 (Phase C Session 7)",
                   "NLC Unified Project Control \u00b7 v1.11.0 (Phase C Session 8)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase C Session 8 merge complete → v1.11.0")
