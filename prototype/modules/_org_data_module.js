/* ============================================================
   §ORG-DATA  Per-project data partitioning  (Phase C — Session 2)
   ============================================================
   Model: ACTIVE WORKING-SET + PER-PROJECT STASH.

   The active project's data lives in the top-level slices
   (state.commercial / execution / procurement / financial / mapping)
   exactly where ~936 existing references already read it. Inactive
   projects' data lives in state.org.projects[id].data. Only switch /
   add / boot-migration touch partitions — zero of the 936 refs change.

   Invariant: state.org.projects[activeProjectId].data === null
   (its real data is live in the working set); every other project's
   data lives in its .data stash.
   ============================================================ */
const _ORG_DATA_SLICES = ['commercial', 'execution', 'procurement', 'financial', 'mapping'];

/* Empty slices sourced from defaultState() so the shape stays in lock-step
   with the canonical definition (no hand-maintained duplicate). */
function _emptyDataSlices() {
  const d = defaultState();
  const out = {};
  _ORG_DATA_SLICES.forEach(k => { out[k] = d[k]; });
  return out;
}

/* Deep-clone the live working set (breaks aliasing before stashing). */
function _extractWorkingSet() {
  const out = {};
  _ORG_DATA_SLICES.forEach(k => { out[k] = state[k]; });
  return JSON.parse(JSON.stringify(out));
}

/* Hydrate the working set from a stash; missing slices fall back to empty. */
function _applyWorkingSet(data) {
  const empty = _emptyDataSlices();
  data = data || {};
  _ORG_DATA_SLICES.forEach(k => {
    state[k] = (data[k] !== undefined && data[k] !== null) ? data[k] : empty[k];
  });
}

/* Idempotent boot migration: give every INACTIVE project a data stash;
   leave the active project's data live in the working set. Projects added
   in Session 1 never had a partition — they get an empty one here. */
function partitionProjectData() {
  if (!state.org || !state.org.projects) return { partitioned: false, alreadyPresent: true };
  if (state.org.dataPartitioned) return { partitioned: false, alreadyPresent: true };

  const active = state.org.activeProjectId;
  let stashedInactive = 0;
  for (const id of Object.keys(state.org.projects)) {
    const p = state.org.projects[id];
    if (id === active) {
      p.data = null;                    // live in working set
    } else if (!p.data) {
      p.data = _emptyDataSlices();       // S1 projects had no partition
      stashedInactive++;
    }
  }
  state.org.dataPartitioned = true;
  audit('org.partition.create', 'org', active || '(none)', null,
        { activeLive: active, stashedInactive },
        'Per-project data partitioning enabled (working-set + stash)');
  saveState();
  return { partitioned: true, alreadyPresent: false, stashedInactive };
}
