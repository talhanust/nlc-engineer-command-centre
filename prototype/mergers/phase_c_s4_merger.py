#!/usr/bin/env python3
"""
PHASE C MERGER — Session 4: Project Archive / Restore (soft delete)
====================================================================
Applies the archive delta over v1.6.0 → produces v1.7.0.

Soft delete only (recoverable). Archived projects hide from switcher +
portfolio, stay visible with Restore in Settings. Guards: cannot archive
the last live project; archiving the active project auto-switches away.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place, v1.6.0 → v1.7.0)
Embeds:       _org_archive_module.js

Transforms (each must hit exactly once):
  1. Embed _org_archive_module.js before the boot anchor
  2. switchActiveProject: refuse switching into an archived project
  3. renderProjectSwitcher: exclude archived projects
  4. computePortfolio: exclude archived projects from the rollup
  5. Replace renderSettingsProjectsTab with the archive-aware version
  6. Bump console banner v1.6.0 -> v1.7.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
ARCH_JS = "_org_archive_module.js"


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

with open(ARCH_JS, 'r', encoding='utf-8') as f:
    arch_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + arch_js + "\n\n" + boot_anchor, "embed _org_archive_module.js")

# ── 2. switchActiveProject archived guard (unique 2-line anchor) ──────
old_guard = ("  if (!state.org || !state.org.projects[projId]) return false;\n"
             "  const before = state.org.activeProjectId;")
new_guard = ("  if (!state.org || !state.org.projects[projId]) return false;\n"
             "  if (state.org.projects[projId].archived) return false;   // S4 \u2014 cannot switch into an archived project\n"
             "  const before = state.org.activeProjectId;")
src = must_replace(src, old_guard, new_guard, "switchActiveProject archived guard")

# ── 3. renderProjectSwitcher excludes archived ───────────────────────
old_sw = "    const projs = getProjectsByPdHq(hq.id);\n    if (!projs.length) continue;"
new_sw = "    const projs = getProjectsByPdHq(hq.id).filter(p => !p.archived);\n    if (!projs.length) continue;"
src = must_replace(src, old_sw, new_sw, "renderProjectSwitcher exclude archived")

# ── 4. computePortfolio excludes archived ────────────────────────────
old_pf = ("      const p = state.org.projects[id];\n"
          "      const data = (id === active)")
new_pf = ("      const p = state.org.projects[id];\n"
          "      if (p.archived) continue;          // S4 \u2014 archived projects excluded from rollup\n"
          "      const data = (id === active)")
src = must_replace(src, old_pf, new_pf, "computePortfolio exclude archived")

# ── 5. Replace renderSettingsProjectsTab (archive-aware) ─────────────
old_settings = """function renderSettingsProjectsTab() {
  const host = document.getElementById('dxProjectsTree');
  if (!host) return;
  if (!state.org) migrateToOrgTree();
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.money) ? fmt.money : (n => 'PKR ' + n);

  const pdHqs = [];
  (function walk(n) {
    if (!n) return;
    if (n.type === 'pd_hq') pdHqs.push(n);
    (n.children || []).forEach(walk);
  })(state.org.tree);

  let html = '<div class="org-tree">';
  for (const hq of pdHqs) {
    const projs = getProjectsByPdHq(hq.id);
    html += '<div class="org-hq"><div class="org-hq-name">' + esc(hq.name) +
            ' <span class="org-count">(' + projs.length + ')</span></div>';
    if (projs.length) {
      html += '<ul class="org-proj-list">';
      for (const pr of projs) {
        const cv = pr.client && pr.client.contractValue ? ' \u00b7 ' + money(pr.client.contractValue) : '';
        html += '<li data-proj="' + esc(pr.id) + '"><span class="org-proj-name">' + esc(pr.name) + '</span>' +
                '<span class="org-proj-meta">' + esc((pr.client && pr.client.name) || '') + cv + '</span></li>';
      }
      html += '</ul>';
    } else {
      html += '<div class="org-empty">No projects</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  /* Add-project mini form (PD HQ select + name) */
  let pdOpts = pdHqs.map(h => '<option value="' + esc(h.id) + '">' + esc(h.name) + '</option>').join('');
  html += '<div class="org-add-form">' +
          '<select id="orgAddPdHq">' + pdOpts + '</select>' +
          '<input type="text" id="orgAddName" placeholder="New project name" maxlength="80">' +
          '<button class="btn" onclick="submitAddProject()">Add Project</button>' +
          '</div>';
  host.innerHTML = html;
}"""

new_settings = """function renderSettingsProjectsTab() {
  const host = document.getElementById('dxProjectsTree');
  if (!host) return;
  if (!state.org) migrateToOrgTree();
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.money) ? fmt.money : (n => 'PKR ' + n);

  const pdHqs = [];
  (function walk(n) {
    if (!n) return;
    if (n.type === 'pd_hq') pdHqs.push(n);
    (n.children || []).forEach(walk);
  })(state.org.tree);

  let html = '<div class="org-tree">';
  for (const hq of pdHqs) {
    const projs = getProjectsByPdHq(hq.id).filter(p => !p.archived);   // S4 \u2014 live only
    html += '<div class="org-hq"><div class="org-hq-name">' + esc(hq.name) +
            ' <span class="org-count">(' + projs.length + ')</span></div>';
    if (projs.length) {
      html += '<ul class="org-proj-list">';
      for (const pr of projs) {
        const cv = pr.client && pr.client.contractValue ? ' \u00b7 ' + money(pr.client.contractValue) : '';
        const canArchive = _liveProjects().length > 1;   // keep at least one live
        html += '<li data-proj="' + esc(pr.id) + '"><span class="org-proj-name">' + esc(pr.name) + '</span>' +
                '<span class="org-proj-meta">' + esc((pr.client && pr.client.name) || '') + cv + '</span>' +
                (canArchive ? '<button class="org-archive-btn" title="Archive project" onclick="if(confirm(\\'Archive this project? It can be restored later.\\'))archiveProject(\\'' + esc(pr.id) + '\\')">Archive</button>' : '') +
                '</li>';
      }
      html += '</ul>';
    } else {
      html += '<div class="org-empty">No projects</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  /* S4 \u2014 Archived projects section (restore-only) */
  const archived = Object.values(state.org.projects).filter(p => p.archived);
  if (archived.length) {
    html += '<div class="org-archived"><div class="org-archived-title">Archived (' + archived.length + ')</div><ul class="org-proj-list">';
    for (const pr of archived) {
      html += '<li data-proj="' + esc(pr.id) + '"><span class="org-proj-name org-archived-name">' + esc(pr.name) + '</span>' +
              '<span class="org-proj-meta">archived ' + esc((pr.archivedAt || '').slice(0, 10)) + '</span>' +
              '<button class="org-restore-btn" title="Restore project" onclick="restoreProject(\\'' + esc(pr.id) + '\\')">Restore</button>' +
              '</li>';
    }
    html += '</ul></div>';
  }

  /* Add-project mini form (PD HQ select + name) */
  let pdOpts = pdHqs.map(h => '<option value="' + esc(h.id) + '">' + esc(h.name) + '</option>').join('');
  html += '<div class="org-add-form">' +
          '<select id="orgAddPdHq">' + pdOpts + '</select>' +
          '<input type="text" id="orgAddName" placeholder="New project name" maxlength="80">' +
          '<button class="btn" onclick="submitAddProject()">Add Project</button>' +
          '</div>';
  host.innerHTML = html;
}"""
src = must_replace(src, old_settings, new_settings, "archive-aware renderSettingsProjectsTab")

# ── 5b. Archive/restore button CSS (before </style>) ─────────────────
arch_css = """
/* \u2500\u2500 Phase C S4 \u2014 archive / restore controls \u2500\u2500 */
.org-archive-btn, .org-restore-btn { margin-left: 10px; font-size: 10.5px; padding: 1px 8px; border-radius: 4px; cursor: pointer; border: 1px solid var(--line, #ccc); background: var(--bg-2, #f5f5f5); }
.org-archive-btn:hover { border-color: #d98080; color: #b23b3b; }
.org-restore-btn:hover { border-color: #6fae6f; color: #2e7d32; }
.org-archived { margin-top: 12px; border-top: 1px dashed var(--line, #ddd); padding-top: 8px; }
.org-archived-title { font-size: 11.5px; font-weight: 600; color: var(--ink-3, #888); margin-bottom: 4px; }
.org-archived-name { color: var(--ink-3, #999); text-decoration: line-through; }

</style>"""
src = must_replace(src, "\n</style>", arch_css, "archive CSS")

# ── 6. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.6.0 (Phase C Session 3)",
                   "NLC Unified Project Control \u00b7 v1.7.0 (Phase C Session 4)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase C Session 4 merge complete → v1.7.0")
