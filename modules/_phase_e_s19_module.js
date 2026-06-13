/* ============================================================
   §LEAGUE-TABLE  Rank immediate children  (Phase E — S19)
   ============================================================
   A ranked table of a node's immediate children by ratio metrics the child
   table doesn't show: collection % (receipts/certified), receivables %
   (net receivable/contract) and cash position. Click any column to re-sort
   (worst-first by default per metric). Reuses computeNodeRollup so figures
   match the rest of the command center. Composes into the command innerHTML;
   needs >=2 children to be worth ranking.
   ============================================================ */

var _leagueSort = { key: 'collectionPct', dir: 1 };
var _LEAGUE_DEFDIR = { collectionPct: 1, receivablesPct: -1, cashPosition: 1, contractValue: -1, name: 1 };

function setLeagueSort(key) {
  if (!(key in _LEAGUE_DEFDIR)) return;
  if (_leagueSort && _leagueSort.key === key) _leagueSort.dir = -_leagueSort.dir;
  else _leagueSort = { key: key, dir: _LEAGUE_DEFDIR[key] || 1 };
  if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) {} }
}

function computeNodeLeague(nodeId) {
  if (typeof computeNodeRollup !== 'function' || typeof _immediateChildNodes !== 'function') return [];
  const children = _immediateChildNodes(nodeId) || [];
  if (!children.length) return [];
  const rollup = computeNodeRollup(nodeId);
  const rows = [];
  children.forEach(ch => {
    let r;
    if (ch.type === 'project') r = rollup.rows.filter(x => x.id === ch.id);
    else { const pd = (typeof _subtreePdHqIds === 'function') ? _subtreePdHqIds(ch.id) : []; r = rollup.rows.filter(x => pd.indexOf(x.pdHqId) >= 0); }
    const sum = k => r.reduce((s, x) => s + Number(x[k] || 0), 0);
    const contract = sum('contractValue'), vetted = sum('vettedRevenue'), receipts = sum('receipts'), netRec = sum('netReceivable'), cash = sum('cashPosition');
    rows.push({
      id: ch.id, name: ch.name || ch.id, type: ch.type,
      projectCount: (ch.type === 'project') ? 1 : r.length,
      contractValue: contract,
      collectionPct: vetted > 0 ? (receipts / vetted * 100) : null,
      receivablesPct: contract > 0 ? (netRec / contract * 100) : null,
      cashPosition: cash
    });
  });
  return rows;
}

function _leagueSortRows(rows) {
  const s = _leagueSort || { key: 'collectionPct', dir: 1 };
  const v = (r) => {
    if (s.key === 'name') return null;
    const x = r[s.key];
    if (x == null) return (s.dir > 0) ? Infinity : -Infinity;   /* nulls sink to the "best" end */
    return x;
  };
  return rows.slice().sort((a, b) => {
    if (s.key === 'name') return (a.name || '').localeCompare(b.name || '') * s.dir;
    return (v(a) - v(b)) * s.dir;
  });
}

function renderLeagueTable(nodeId) {
  const rows = computeNodeLeague(nodeId);
  if (rows.length < 2) return '';
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.money) ? fmt.money : (n => String(n));
  const pct = x => (x == null) ? '\u2014' : (Math.round(x * 10) / 10) + '%';
  const s = _leagueSort || { key: 'collectionPct', dir: 1 };
  const arrow = key => (s.key === key) ? (s.dir > 0 ? ' \u25b2' : ' \u25bc') : '';
  const th = (key, label, cls) => '<th class="league-th' + (cls ? ' ' + cls : '') + (s.key === key ? ' league-active' : '') + '" onclick="setLeagueSort(\'' + key + '\')">' + label + arrow(key) + '</th>';
  const sorted = _leagueSortRows(rows);
  const body = sorted.map((r, i) =>
    '<tr class="league-row" onclick="if(typeof setActiveNode===\'function\')setActiveNode(\'' + esc(r.id) + '\')">' +
    '<td class="league-rank">' + (i + 1) + '</td>' +
    '<td class="league-name">' + esc(r.name) + '</td>' +
    '<td class="num">' + pct(r.collectionPct) + '</td>' +
    '<td class="num">' + pct(r.receivablesPct) + '</td>' +
    '<td class="num">' + money(r.cashPosition) + '</td>' +
    '</tr>'
  ).join('');
  return '<div class="league-wrap"><div class="cmd-childtitle">League table \u2014 click a column to rank (worst-first by default)</div>' +
    '<table class="league-table"><thead><tr>' +
    '<th class="league-rank">#</th>' + th('name', 'Node', 'league-name') +
    th('collectionPct', 'Collection', 'num') + th('receivablesPct', 'Receivables', 'num') + th('cashPosition', 'Cash', 'num') +
    '</tr></thead><tbody>' + body + '</tbody></table></div>';
}
