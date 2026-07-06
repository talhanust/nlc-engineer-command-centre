/**
 * Mix-design library (spec §6, §9 A6): standard concrete grades and asphalt
 * classes with editable constituent coefficients. Constituents reference the
 * material master; a plant production run of grade G consumes
 * qty × coeff of each constituent, recorded against plant stock.
 */

export interface MixConstituent {
  materialRef: string;   // material-master code
  coeff: number;         // per output unit
}

export interface MixDesign {
  id: string;            // 'C20', 'AC-WEARING', …
  name: string;
  outputUnit: string;    // 'Cu.m' | 'ton'
  kind: 'concrete' | 'asphalt';
  constituents: MixConstituent[];
}

/** Standard library — per m³ of concrete / per tonne of asphalt (editable per project). */
export const DEFAULT_MIX_DESIGNS: MixDesign[] = [
  { id: 'C15', name: 'Concrete C15 (1:2:4 nominal)', outputUnit: 'Cu.m', kind: 'concrete',
    constituents: [{ materialRef: 'CEM', coeff: 6.0 }, { materialRef: 'SAND', coeff: 15.5 }, { materialRef: 'CRUSH-20', coeff: 30.0 }] },
  { id: 'C20', name: 'Concrete C20', outputUnit: 'Cu.m', kind: 'concrete',
    constituents: [{ materialRef: 'CEM', coeff: 7.2 }, { materialRef: 'SAND', coeff: 16.0 }, { materialRef: 'CRUSH-10', coeff: 9.0 }, { materialRef: 'CRUSH-20', coeff: 18.0 }, { materialRef: 'ADMIX', coeff: 1.1 }] },
  { id: 'C30', name: 'Concrete C30', outputUnit: 'Cu.m', kind: 'concrete',
    constituents: [{ materialRef: 'CEM', coeff: 8.4 }, { materialRef: 'SAND', coeff: 15.0 }, { materialRef: 'CRUSH-10', coeff: 10.0 }, { materialRef: 'CRUSH-20', coeff: 17.0 }, { materialRef: 'ADMIX', coeff: 1.6 }] },
  { id: 'AC-BASE', name: 'Asphaltic concrete — base course', outputUnit: 'ton', kind: 'asphalt',
    constituents: [{ materialRef: 'BITUMEN', coeff: 0.038 }, { materialRef: 'AGG-ASPHALT', coeff: 0.62 }] },
  { id: 'AC-WEARING', name: 'Asphaltic concrete — wearing course', outputUnit: 'ton', kind: 'asphalt',
    constituents: [{ materialRef: 'BITUMEN', coeff: 0.045 }, { materialRef: 'AGG-ASPHALT', coeff: 0.60 }] },
];

/** Constituent demand for a production run: qty of grade → Map(materialRef → qty). */
export function runConsumption(design: MixDesign, outputQty: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of design.constituents) out.set(c.materialRef, +(c.coeff * outputQty).toFixed(2));
  return out;
}
