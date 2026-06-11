#!/usr/bin/env python3
"""
PHASE C MERGER — Session 5: Editable PD-HQ Tree
================================================
Applies the editable-tree delta over v1.7.0 → produces v1.8.0.

Adds PD-HQ CRUD (add/rename/remove under HQ Engrs) + project reparenting,
with HQ-management + reparent UI in Settings → Projects.

Reads/Writes: FGEHA_NLC_F14F15_UnifiedControl_v1_0.html (in place, v1.7.0 → v1.8.0)
Embeds:       _org_tree_module.js

Transforms (each must hit exactly once):
  1. Embed _org_tree_module.js before the boot anchor
  2. Replace renderSettingsProjectsTab with the editable-tree version
  3. Add editable-tree CSS before </style>
  4. Bump console banner v1.7.0 -> v1.8.0
"""

import sys

PATH = "FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
TREE_JS = "_org_tree_module.js"


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

with open(TREE_JS, 'r', encoding='utf-8') as f:
    tree_js = f.read()

# ── 1. Embed module ──────────────────────────────────────────────────
boot_anchor = "document.addEventListener('DOMContentLoaded', boot);\n</script>"
src = must_replace(src, boot_anchor, "\n" + tree_js + "\n\n" + boot_anchor, "embed _org_tree_module.js")

# ── 2. Replace renderSettingsProjectsTab (editable-tree version) ─────
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

new_settings = """function renderSettingsProjectsTab() {
  const host = document.getElementById('dxProjectsTree');
  if (!host) return;
  if (!state.org) migrateToOrgTree();
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.money) ? fmt.money : (n => 'PKR ' + n);

  const pdHqs = (typeof _pdHqList === 'function') ? _pdHqList() : (function () {
    const a = []; (function walk(n) { if (!n) return; if (n.type === 'pd_hq') a.push(n); (n.children || []).forEach(walk); })(state.org.tree); return a;
  })();

  const reparentSelect = (pr, hqId) => {
    const others = pdHqs.filter(h => h.id !== hqId);
    if (!others.length) return '';
    return '<select class="org-reparent" title="Move to another PD HQ" onchange="reparentProject(\\'' + esc(pr.id) + '\\', this.value)">' +
           '<option value="" selected disabled>Move\u2026</option>' +
           others.map(h => '<option value="' + esc(h.id) + '">' + esc(h.name) + '</option>').join('') +
           '</select>';
  };

  let html = '<div class="org-tree">';
  for (const hq of pdHqs) {
    const allForHq = getProjectsByPdHq(hq.id);                 // live + archived (removal guard)
    const projs = allForHq.filter(p => !p.archived);           // live only (display)
    const canRemoveHq = allForHq.length === 0 && pdHqs.length > 1;
    html += '<div class="org-hq"><div class="org-hq-name">' + esc(hq.name) +
            ' <span class="org-count">(' + projs.length + ')</span>' +
            '<button class="org-hq-btn" title="Rename PD HQ" onclick="promptRenamePdHq(\\'' + esc(hq.id) + '\\')">Rename</button>' +
            (canRemoveHq ? '<button class="org-hq-btn org-hq-remove" title="Remove empty PD HQ" onclick="if(confirm(\\'Remove this empty PD HQ?\\'))removePdHq(\\'' + esc(hq.id) + '\\')">Remove</button>' : '') +
            '</div>';
    if (projs.length) {
      html += '<ul class="org-proj-list">';
      for (const pr of projs) {
        const cv = pr.client && pr.client.contractValue ? ' \u00b7 ' + money(pr.client.contractValue) : '';
        const canArchive = _liveProjects().length > 1;   // keep at least one live
        html += '<li data-proj="' + esc(pr.id) + '"><span class="org-proj-name">' + esc(pr.name) + '</span>' +
                '<span class="org-proj-meta">' + esc((pr.client && pr.client.name) || '') + cv + '</span>' +
                reparentSelect(pr, hq.id) +
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

  /* S5 \u2014 Add PD HQ form */
  html += '<div class="org-add-form org-add-hq">' +
          '<input type="text" id="orgAddHqName" placeholder="New PD HQ name" maxlength="60">' +
          '<button class="btn" onclick="submitAddPdHq()">Add PD HQ</button>' +
          '</div>';

  host.innerHTML = html;
}"""
src = must_replace(src, old_settings, new_settings, "editable-tree renderSettingsProjectsTab")

# ── 3. Editable-tree CSS ─────────────────────────────────────────────
tree_css = """
/* \u2500\u2500 Phase C S5 \u2014 editable PD-HQ tree controls \u2500\u2500 */
.org-hq-btn { margin-left: 8px; font-size: 10px; padding: 1px 7px; border-radius: 4px; cursor: pointer; border: 1px solid var(--line, #ccc); background: var(--bg-2, #f5f5f5); font-weight: 500; }
.org-hq-btn:hover { border-color: var(--accent, #1e6fd9); }
.org-hq-remove:hover { border-color: #d98080; color: #b23b3b; }
.org-reparent { margin-left: 10px; font-size: 10.5px; padding: 1px 4px; border-radius: 4px; border: 1px solid var(--line, #ccc); background: var(--bg-1, #fff); }
.org-add-hq { margin-top: 8px; }

</style>"""
src = must_replace(src, "\n</style>", tree_css, "editable-tree CSS")

# ── 4. Banner bump ───────────────────────────────────────────────────
src = must_replace(src,
                   "NLC Unified Project Control \u00b7 v1.7.0 (Phase C Session 4)",
                   "NLC Unified Project Control \u00b7 v1.8.0 (Phase C Session 5)",
                   "console banner")

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
new_len, new_lines = len(src), src.count('\n')
print(f"Wrote {PATH}: {new_lines} lines (+{new_lines - orig_lines}), {new_len:,} chars (+{new_len - orig_len:,})")
print("Phase C Session 5 merge complete → v1.8.0")
