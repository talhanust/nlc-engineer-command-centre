#!/usr/bin/env python3
"""
PHASE E MERGER — Session 25: Global-filter re-aggregation
==========================================================
Over v1.41.0 -> v1.42.0.

Embeds: _phase_e_s25_module.js
(_projectsUnderNode applies _projectPassesGlobalFilter to branch lists — that
edit lives in _phase_d_command_module.js, re-applied by the chain.)

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Bump console banner v1.41.0 -> v1.42.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E25_JS = "_phase_e_s25_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E25_JS, 'r', encoding='utf-8') as f:
    e25 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e25 + "\n\n" + boot_anchor, "embed e25 module")

# 2. apply the global filter to the access-scoped branch list (post phase_d_s4)
old_pun = "  const pdIds = _subtreePdHqIds(nodeId);\n  return Object.values(state.org.projects).filter(p => !p.archived && pdIds.indexOf(p.pdHqId) !== -1 && _accessibleProject(p));\n}"
new_pun = ("  const pdIds = _subtreePdHqIds(nodeId);\n"
           "  let _pun = Object.values(state.org.projects).filter(p => !p.archived && pdIds.indexOf(p.pdHqId) !== -1 && _accessibleProject(p));\n"
           "  /* Phase E S25 \u2014 global-filter re-aggregation (branch lists only; single-project\n"
           "     returns above stay unfiltered, keeping the RAG predicate non-recursive) */\n"
           "  if (typeof _projectPassesGlobalFilter === 'function' && typeof _filterActive === 'function' && _filterActive()\n"
           "      && !(typeof _projectFilterReentry === 'function' && _projectFilterReentry())) {\n"
           "    _pun = _pun.filter(_projectPassesGlobalFilter);\n"
           "  }\n"
           "  return _pun;\n}")
src = must_replace(src, old_pun, new_pun, "_projectsUnderNode re-aggregation")

# 2. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.41.0 (Phase E Session 24 \u2014 Cash-flow hover tooltips)",
                   "NLC Unified Project Control \u00b7 v1.42.0 (Phase E Session 25 \u2014 Filter re-aggregation)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 25 merge complete → v1.42.0")
