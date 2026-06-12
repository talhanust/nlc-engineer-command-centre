# NLC Engineer Command Centre — Operating Model (polished requirements)

This restates the supplied operating model in a consistent, professional form, and is the
contract for staged integration. Roles are normalised to a single vocabulary (see Roles).

## 0. Project creation
On creation the user enters **salients**; an **empty project** is provisioned with all tabs
(Commercial, Distribution, Execution, Mapping, Procurement, HR, Financial) and empty registers.

## 1. Roles (normalised)
Project (PMU): **SQS** (Senior Quantity Surveyor), **QS**, **PM** (Project Manager),
**Planning Engineer**, **Procurement Manager**, **Store In-charge**, **FM** (Finance Manager).
HQ PD: **Manager Contracts**, **Manager Plan**, **Manager Procurement**, **Manager Pre-Audit**,
**GM Monitoring**, **PD** (Project Director), **FM (HQ PD)**.
HQ Engineers: **SDO Tech**, **Senior Manager Contracts**, **Senior Manager Procurement**,
**Manager Plan (Engrs)**, **Dy Comd Engineer**, **Comd Engineers**, **CFO**.
HQ NLC: **Dir (Sp)**, **DG NLC**, **OIC NLC**.
> Open item: the source text uses both **SOS** and **SQS** in billing; normalised to **SQS** unless
> SOS denotes a distinct "Surveyor of Site" — to be confirmed.

## 2. Commercial — BOQ lifecycle
- **Initial BOQ:** SQS uploads BOQ per contract → SQS **validates** → PM **endorses** →
  Manager Contracts **verifies** → **BOQ locked**. Each item: Quantity, Rate, Amount.
- **Variation order (VO):** while editing a VO the BOQ is **not** locked. SQS **edits** →
  PM **validates** → Manager Contracts **endorses** → PD **verifies** → **locked**.
- Overall and item-wise **Gross Margin** shown for the BOQ.

## 3. Distribution planner
- SQS distributes each item's contract quantity across **Labor-Rate Execution** and
  **Sublet Execution** (and any **NLC-direct** remainder).
- Labor quantities split across **labor contractors** (with labor rates); sublet quantities split
  across **sublet contractors** (with sublet rates).
- **Check:** Σ distributed quantity ≤ main BOQ quantity (per item).
- **Gross Margin** shown per contract (overall + item-wise) and for the overall BOQ.
- Contracts are finalised, then approved by the **Competent Authority by value + type**:
  - **Labor:** PD ≤ 15 Mn · Comd Engr ≤ 30 Mn · DG ≤ 50 Mn.
  - **Sublet:** PD ≤ 150 Mn · Comd Engr ≤ 300 Mn · DG ≤ 1000 Mn · OIC > 1000 Mn.
  - After approval the contract is **locked**; amendments re-approve then re-lock.

## 4. Contractor profiles
Separate profile per labor/sublet contractor: Company, Owner, CNIC, **PEC category**,
NLC enlistment, address, contact. Plus performance (overall + CA-wise), revenue/profit
contribution, contracts awarded & amounts, executed/paid works, liabilities, recoveries due,
performance security, advances, material issued, retention held.
- **Gate:** work cannot be awarded **beyond the contractor's PEC category**.

## 5. Billing
- **IPC (client):** SQS generates from executed quantities → PM validates → submit to Consultant →
  PM marks **Vetted** (consultant) → PM marks **Approved** (client) → FM **records receipt**.
- **RAR (sublet), interim:** SQS generates from executed quantities → PM endorses → Pre-Audit
  vets → PD approves → FM marks **Paid**.
- **RAR final bill:** PD → HQ Engrs: SDO Tech tech-checks → Manager Contracts scrutinises →
  Senior Manager Contracts → Dy Comd Engineer → Comd Engineers approve → mark **CFO** → CFO
  issues **Payment Authority** → auto-marked to **FM (HQ PD)** → mark **Paid**.
- **Retention:** half released with final bill; second half after **DLP**; one payment authority
  after PD.
- **Recoveries first:** RAR/Final Bill processed only **after due recoveries** are netted.
- **Withholdings (distinct from retention):**
  - Sublet: 70% gross payable in RAR if client IPC not yet approved; the withheld 30% paid on
    receipt of the corresponding IPC payment, **after** deducting retention.
  - Labor: 95% paid; remaining 5% after the IPC is approved.

## 6. Execution
- Planning Engineer imports the **Primavera baseline** (all activities) → PM validates →
  Manager Plan (HQ PD) scrutinises → PD endorses → Manager Plan (HQ Engrs) tech-checks →
  Comd Engineer approves → **locked**; amendments re-run the cycle then re-lock.
- Planning Engineer enters **planned indirect/overhead costs** (salaries, light-vehicle POL,
  other); **actuals** booked in the Financial tab are shown against plan.

## 7. Mapping
- SQS + Planning Engineer + Manager Contracts map **BOQ items → baseline activities**; PM
  validates; PD approves; changes re-approved by PD.
- SQS + Planning Engineer + Manager Procurement map **materials, material quantities and
  resources** to each activity. Sublet-executed quantities: contractor self-procures. Centrally
  procured constituents (steel, cement, bitumen for steel/concrete/asphalt) used on labor
  execution; NLC often centrally procures for both. Material **issued → consumed → recovered →
  balance-to-recover** tracked; mapping to activities generates **procurement timelines**.

## 8. Procurement
- **Material requisition:** Procurement Manager generates → SQS + Planning Engineer validate →
  PM approves → HQ PD Manager Procurement validates → GM Monitoring → Dy Comd Engineer →
  Comd Engineer → **Dir (Sp) HQ NLC** approves → approved.
- **PO:** HQ PD Procurement Manager generates → PD approves → issued to supplier.
- **CRV:** Store In-charge generates on receipt → PM validates → HQ PD Manager Pre-Audit vets →
  PD approves → FM pays → **Paid**.
- **Hiring (machinery/plant/equipment/vehicles):** Procurement Manager generates → SQS +
  Planning Engineer validate → PM approves → HQ PD Manager Procurement validates → Senior
  Manager Procurement → GM Monitoring → Dy Comd Engineer → Comd Engineer approves (may escalate
  to Dir Sp / DG). Running tracked daily/monthly; payments: Pre-Audit vets → PD approves → FM Paid.
- **Inventory Management** sub-tab: integral & hired plant/equipment/vehicles + utilisation;
  material status.
- **POL** sub-tab: fuel procured, issued to integral/hired plant & vehicles, ideal vs actual
  consumption by running, in-store POL.
- **Fixed Assets** sub-tab: project fixed assets.
- **Maintenance:** request generated separately → PM validates → HQ PD onward for approval and
  payment.

## 9. HR
Direct & indirect manpower: HR number, name, service duration, time-on-project, monthly cost
booked to the project. Roll-up rule: project HR at project; HQ PD level **includes** HQ PD HR;
HQ Engrs level **includes** HQ Engrs HR; HQ NLC level shown but **excludes** HQ NLC HR.

## 10. Financial
All receipts, payments, liabilities and profitability (every cost and revenue line).

## 11. Progress update
QS enters **executed quantity per item** (daily/weekly/monthly) → PM validates & approves.
Via mapping the progress reflects into Execution against planned activities. IPCs and RARs are
generated from the **executed quantities** (single source of truth).
