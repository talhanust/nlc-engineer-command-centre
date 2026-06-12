# Spec analysis: logical gaps, app gap, and integration plan

## A. Logical gaps / ambiguities in the operating model (to confirm)
1. **SOS vs SQS.** Billing says "SOS shall generate IPCs/RARs"; elsewhere it's SQS. Same role? Resolve.
2. **VO needs higher authority than the original BOQ.** Initial BOQ ends at Manager Contracts;
   a VO requires PD. Confirm intended (change > origination), or align.
3. **Labor ceiling has no tier above DG (50 Mn).** Sublet has OIC > 1000 Mn but labor stops at DG.
   What approves a labor contract > 50 Mn? Also confirm hierarchy **OIC vs DG**.
4. **Gross-margin formula undefined.** Margin = BOQ amount − (contractor cost + net material cost)?
   Since material is centrally procured and recovered, the basis must state how material is netted.
5. **Execution categories.** Only Labor + Sublet named; is there an **NLC-direct** remainder? The app
   already models a `self` mode — confirm it stays.
6. **PEC category gate needs data.** No PEC-category → value/scope ceiling table is given.
7. **Retention rate and DLP duration unspecified.** Retention % and DLP length (e.g. 365 days) needed.
8. **Two distinct withholdings.** Sublet 70/30 and labor 95/5 are **progress** withholdings, separate
   from **retention**. The 30% release must state ordering: "on IPC receipt, pay 30% less retention".
9. **"After due recoveries."** A RAR/Final Bill must be gated on computed recoveries (material
   consumed, advances, secured). This couples Billing → Mapping/Material modules; define the gate.
10. **Who flags a bill "final"?** The long HQ-Engrs chain applies only to final bills — define the trigger.
11. **Multi-author steps.** Mapping and requisition list several validators (SQS + Planning + Manager);
    define which role **submits** vs **co-signs**.
12. **HR roll-up asymmetry.** HQ NLC sees HR but excludes its own — confirm (unusual but plausible).
13. **Progress single-source.** Executed quantity must feed **both** execution progress and IPC/RAR
    generation without double entry — define it as the one input.

## B. Gap vs the existing app
Already present: BOQ register (import/export), IPC pipeline + deductions/retention, RAR + recovery
+ chain, distribution modes (self/sublet/labour), subcontractors (minimal), advances, escalation,
reconciliation, schedule/Gantt/baseline import, S-curve + period mapping + twin curve, BOQ↔WBS and
BOQ↔material mapping, financial (receipts/payments/liabilities/EVM/P&L/working-capital/margin),
procurement (demands + 6 chains + inbox + powers + POs + CRVs + payments + suppliers + hires),
production+materials, photo gallery, project map, salients, access matrix, audit, detail modals.

Missing vs spec (program of work):
1. **BOQ lifecycle** (upload→validate→endorse→verify→**lock**; VO cycle). — *started this pass*
2. **Expanded role vocabulary** + **contract-type ceilings** (labor vs sublet). — *added this pass*
3. **Distribution planner v2**: labor/sublet **rates**, per-contractor split, **gross margin**,
   Σqty ≤ BOQ qty, contract finalisation + CA approval + lock.
4. **Contractor profiles** (PEC, enlistment, securities, advances, materials, retention, performance)
   + **PEC-category award gate**.
5. **Billing chains v2**: IPC roles per spec; RAR **interim vs final** (long HQ-Engrs chain + CFO
   payment authority); retention **half/half + DLP**; **70/30** & **95/5** withholdings; recoveries gate.
6. **Execution**: baseline **approval chain** + **overheads** planned-vs-actual.
7. **Mapping approval** workflow (BOQ↔activity, material/resource↔activity) + procurement-timeline gen.
8. **Procurement chains v2** (requisition, hiring, CRV, **maintenance**) with the exact role routing;
   **Inventory**, **POL**, **Fixed Assets** sub-tabs.
9. **HR tab** with roll-up semantics.
10. **Progress update** workflow (QS enter → PM validate) as the single source feeding IPC/RAR + execution.

## C. Sequenced integration plan (each = one tested, shippable slice)
1. **BOQ lifecycle + roles + ceilings** ✅ this pass (workflow, lock, VO, role vocab, labor/sublet powers).
2. **Distribution planner v2** ✅ (per-item labor/sublet/NLC-direct allocation, rates, gross margin overall+itemwise, Σqty≤BOQ check, per-contract value → Competent Authority by type+value → approve & lock).
3. **Contractor profiles + PEC gate** ✅ (profile fields: kind/owner/CNIC/PEC/enlistment/address/contact/security; derived standing: contracts/awarded/executed/paid/liabilities/advances; **PEC-category award gate** enforced in the planner).
4. **Billing v2** (IPC/RAR role chains, final-bill long chain + CFO, retention half/half + DLP, 70/30 & 95/5).
5. **Execution approval chain + overheads**.
6. **Mapping approval + material recovery linkage**.
7. **Procurement v2 + Inventory/POL/Fixed-Assets + Maintenance**.
8. **HR tab + roll-up**.
9. **Progress-update workflow as single source**.
10. **Backend wiring** (api → Postgres + OIDC/RBAC) to enforce all chains server-side.
