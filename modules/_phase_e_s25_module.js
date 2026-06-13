/* ============================================================
   §FILTER-REAGG  Re-aggregating project predicate  (Phase E — S25)
   ============================================================
   Promotes the global filter (S14) from a display-only child filter to a true
   re-aggregation: _projectsUnderNode (branch lists) is narrowed by this
   predicate, so every total / S-curve / cash flow / exceptions / league /
   pipeline derived from it re-scopes. Search + client are plain field checks;
   the RAG predicate computes per-project nodeHealth. A reentry flag guards the
   health computation (defensive — the single-project _projectsUnderNode path is
   already unfiltered, so health computation does not re-enter the branch filter).
   Default-empty filter → predicate never runs (identity).
   ============================================================ */

var _filterReentry = false;
function _projectFilterReentry() { return _filterReentry === true; }

function _projectPassesGlobalFilter(p) {
  if (!p) return false;
  const f = (typeof _globalFilters === 'function') ? _globalFilters() : { search: '', client: '', rag: '' };
  if (f.search && (p.name || '').toLowerCase().indexOf(f.search.toLowerCase()) < 0) return false;
  if (f.client && (((p.client && p.client.name) || '')) !== f.client) return false;
  if (f.rag) {
    let status = 'green';
    _filterReentry = true;
    try { status = (typeof nodeHealth === 'function') ? (nodeHealth(p.id).status || 'green') : 'green'; }
    catch (e) { status = 'green'; }
    finally { _filterReentry = false; }
    if (status !== f.rag) return false;
  }
  return true;
}
