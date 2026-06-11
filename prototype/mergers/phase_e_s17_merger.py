#!/usr/bin/env python3
"""
PHASE E MERGER — Session 17: Register editor (bulk-select + status + notes)
============================================================================
Over v1.33.0 -> v1.34.0.

Embeds: _phase_e_s17_module.js. Additive — the existing renderIPCHistory is
untouched except for a one-line hook that also renders the editor.

Transforms (each must hit exactly once):
  1. Embed module before the boot anchor
  2. Editor host right after the IPC history list
  3. Hook renderRegisterEditor at the top of renderIPCHistory (after its guard)
  4. Register editor CSS
  5. Bump console banner v1.33.0 -> v1.34.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
E17_JS = "_phase_e_s17_module.js"


def must_replace(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"FATAL [{label}]: expected 1 occurrence, found {n}\n  near: {old[:120]!r}")
    return src.replace(old, new)


with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Loaded {PATH}: {len(src):,} chars")
with open(E17_JS, 'r', encoding='utf-8') as f:
    e17 = f.read()

# 1. embed
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + e17 + "\n\n" + boot_anchor, "embed e17 module")

# 2. editor host after the IPC history list
hist_host = '<div id="ipcHistList" class="ipc-list"></div>'
src = must_replace(src, hist_host,
                   hist_host + '\n      <div id="regEditorHost" class="reg-editor"></div>',
                   "register editor host")

# 3. hook at top of renderIPCHistory (after its host guard)
guard = "function renderIPCHistory() {\n  if (!document.getElementById('ipcHistList')) return;"
src = must_replace(src, guard,
                   guard + "\n  if (typeof renderRegisterEditor === 'function') { try { renderRegisterEditor(); } catch (e) {} }",
                   "renderIPCHistory hook")

# 4. CSS
reg_css = """
/* \u2500\u2500 Phase E S17 \u2014 register editor \u2500\u2500 */
.reg-editor { margin-top: 14px; }
.reg-editor:empty { display: none; }
.reg-editor-h { font-size: 12.5px; font-weight: 600; color: var(--ink-2, #44506a); margin-bottom: 8px; }
.reg-editor-h .reg-ro { font-size: 10.5px; font-weight: 500; color: var(--ink-3, #99a3b2); font-style: italic; margin-left: 8px; text-transform: uppercase; letter-spacing: .03em; }
.reg-bulkbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 7px 10px; background: var(--bg-1, #f3f6fb); border: 1px solid var(--line, #e3e8ef); border-radius: 7px; margin-bottom: 8px; font-size: 12.5px; }
.reg-selall { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.reg-selcount { color: var(--ink-3, #8a94a3); font-size: 11.5px; }
.reg-bulkact { display: inline-flex; align-items: center; gap: 6px; }
.reg-bulkact select { padding: 2px 6px; border: 1px solid var(--line, #d7deea); border-radius: 5px; font-size: 12px; }
.reg-apply { padding: 3px 12px; border: 1px solid var(--accent, #1e6fd9); background: var(--accent, #1e6fd9); color: #fff; border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: 600; }
.reg-apply:disabled { opacity: .4; cursor: default; }
.reg-clear { padding: 3px 10px; border: 1px solid var(--line, #d7deea); background: transparent; border-radius: 5px; cursor: pointer; font-size: 12px; }
.reg-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.reg-table th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line, #e3e8ef); color: var(--ink-3, #8a94a3); font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
.reg-table th.num, .reg-table td.num { text-align: right; }
.reg-table td { padding: 5px 8px; border-bottom: 1px solid var(--line-2, #f0f3f8); }
.reg-row.sel { background: var(--bg-1, #eef3fb); }
.reg-row .reg-amt { font-variant-numeric: tabular-nums; color: var(--ink-2, #44506a); }
.reg-status select { padding: 2px 6px; border: 1px solid var(--line, #d7deea); border-radius: 5px; font-size: 12px; }
.reg-note-in { width: 100%; box-sizing: border-box; padding: 3px 7px; border: 1px solid var(--line, #e3e8ef); border-radius: 5px; font-size: 12px; }
.reg-note-in:focus { border-color: var(--accent, #1e6fd9); outline: none; }

</style>"""
src = must_replace(src, "\n</style>", reg_css, "register editor CSS")

# 5. banner
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.33.0 (Phase E Session 16 \u2014 Undo toasts + empty states)",
                   "NLC Unified Project Control \u00b7 v1.34.0 (Phase E Session 17 \u2014 Register editor)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Wrote {PATH}: {len(src):,} chars")
print("Phase E Session 17 merge complete → v1.34.0")
