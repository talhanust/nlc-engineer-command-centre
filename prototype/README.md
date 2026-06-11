# FGEHA × NLC Unified Project Control — Project Handoff Bundle

Everything needed to continue this project in a new chat or hand it to another developer.

## What's here

```
handoff/
├── README.md                              ← this file
├── CONTINUATION_PROMPT_for_new_chat.md    ← PASTE THIS into a new chat (start here)
├── FGEHA_NLC_Continuation_Prompt.md       ← granular internal build log (rev 5.39)
├── build_all.sh                           ← rebuild the app from baseline (the 40-merger chain)
├── run_tests.sh                           ← run all 44 smoke-test suites
├── app/
│   └── FGEHA_NLC_F14F15_UnifiedControl_v1_43_0.html   ← the current app (open in a browser)
├── baseline/
│   └── FGEHA_NLC_F14F15_UnifiedControl_BASELINE_v1_3_7.html  ← original, required to rebuild
├── modules/        ← 38 × *_module.js   (feature source: _phase_*, _org_*, _portfolio, _financial, _procurement)
├── mergers/        ← 40 × phase_*_merger.py    (surgical embedders, in chain order)
├── tests/          ← 44 × smoke_test_*.js      (Node DOM-stub harnesses)
├── demo-data/
│   ├── FGEHA-NLC_Demo_Backup.json          ← 9-project demo (import via ⬆ Restore)
│   └── FGEHA-NLC_Demo_Backup_20plus.json   ← 21-project demo incl. mapping
└── prior-phase-mergers/   ← phase_a / phase_b (already baked into the baseline; for reference only)
```

## To just use the app
Open `app/FGEHA_NLC_F14F15_UnifiedControl_v1_43_0.html` in a browser. To load sample data, click **⬆ Restore** (top header) and pick a file from `demo-data/`. Note: Restore **replaces** all state.

## To continue development in a new chat
1. Open a new chat with the assistant.
2. Attach `app/FGEHA_NLC_F14F15_UnifiedControl_v1_43_0.html` (required), this `CONTINUATION_PROMPT_for_new_chat.md`, and `FGEHA_NLC_Continuation_Prompt.md`. Attaching the `modules/`, `mergers/`, `tests/` files too lets the assistant rebuild via the clean chain.
3. Paste `CONTINUATION_PROMPT_for_new_chat.md` as your first message and state which next step you want.

## To rebuild from source (requires python3 + node)
```
bash build_all.sh      # baseline + 40 mergers  ->  app/...v1_43_0.REBUILT.html
bash run_tests.sh      # runs all 44 smoke suites
```
Expected: **1,185 / 1,186** assertions pass. The only non-green is `execution_tabs` at **9/10** — a pre-existing baseline quirk (the `lookahead` tab has no single primary host), **not a regression**.

## The build model (why it works this way)
The app is one self-contained HTML file. Each feature is a JS **module** embedded by a Python **merger** that performs exactly-once string replacements against the previous build. The chain is always rebuilt from the baseline, so changing an owned module and re-running the chain cleanly updates the app. See `FGEHA_NLC_Continuation_Prompt.md` for exact internals, anchors, and the per-session history (Phase C → v1.43.0).

## Status at handoff
- Version **v1.43.0** (Phase E, Session 26 — XSS hardening).
- 44 test suites, **1,185/1,186** passing, zero regressions.
- Direction agreed: **on-prem**, **incremental backend**, **security-first**. Roadmap in the continuation prompt (§7, §12, §13).
