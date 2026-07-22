// Sample CSVs offered in the import tabs, so a user can see the exact expected
// shape instead of guessing at it from an error message. The sample rows are
// real Margalla Avenue items (Bill 1 earthworks, Bill 4a/4b structures) chosen
// deliberately to demonstrate the things people get wrong:
//
//   1. `bill` is what disambiguates a repeated code. 401f "Lean concrete" is
//      priced under several bills; bill+code is the unique key, code alone is not.
//   2. one row per BOQ item, rate excluding GST, qty in the BOQ's own unit.
//
// Extra columns are ignored by both importers, so a user can keep their own
// working columns (remarks, P/L %, amount) in the sheet and still upload it.

/** Header + sample rows for the main project BOQ import (Bill of Quantities → Import). */
export const BOQ_TEMPLATE_AOA: Array<Array<string | number>> = [
  ['bill', 'code', 'description', 'unit', 'qty', 'rate'],
  ['1', '101', 'Clearing & grubbing', 'SM', 209958, 37.18278],
  ['1', '108c', 'Formation of embankment from borrow excavation', 'CM', 397211, 730.9351752671676],
  ['2', '201', 'Granular Sub base', 'CM', 17594, 5598.943872662292],
  ['4a', '401f', 'Lean concrete', 'CM', 335, 13812.42],
  ['4b', '401f', 'Lean concrete', 'CM', 82, 13812.42],
];

/**
 * Header + sample rows for a subcontractor's own BOQ (New sublet contract → Upload).
 *
 * This sheet carries ONLY what is sublet: the items, the sublet quantities and the
 * sublet rate. It is not a second copy of the BOQ and it never states revenue —
 * the project's ORIGINAL BOQ rate is what NLC earns, and the margin is derived
 * from the two: (original BOQ rate − sublet rate) × sublet qty. So an item that
 * is not sublet simply does not appear here, and a partly-sublet item appears
 * with only the quantity awarded.
 */
export const SUBLET_TEMPLATE_AOA: Array<Array<string | number>> = [
  ['bill', 'code', 'description', 'unit', 'qty', 'rate'],
  ['1', '101', 'Clearing & grubbing', 'SM', 209958, 32.7208464001795],
  ['1', '108c', 'Formation of embankment from borrow excavation', 'CM', 397211, 643.2229542351074],
  ['2', '201', 'Granular Sub base', 'CM', 17594, 4927.070607942817],
  ['4a', '401f', 'Lean concrete', 'CM', 335, 12154.93],
  ['4b', '401f', 'Lean concrete', 'CM', 82, 12154.93],
];

export const BOQ_TEMPLATE_FILENAME = 'boq-import-template.csv';
export const SUBLET_TEMPLATE_FILENAME = 'sublet-contract-boq-template.csv';
