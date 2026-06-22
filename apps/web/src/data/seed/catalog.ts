// Bill structure and item catalogue distilled from the real F-14/F-15 Islamabad
// BOQ (MRS 2nd Bi-Annual). Shares are each bill's fraction of the contract value;
// items carry authentic descriptions, units and MRS rates. The seed generator
// scales quantities so each bill totals share × contract value.

export interface CatalogItem { desc: string; unit: string; rate: number; weight: number; section: string }
export interface CatalogBill { no: string; name: string; share: number; items: CatalogItem[] }

export const BILLS: CatalogBill[] = [
  { no: '1', name: 'Road Work', share: 0.3966, items: [
    { section: 'Earthwork', desc: 'Clearing and grubbing', unit: '1000 Sft', rate: 5564.11, weight: 0.06 },
    { section: 'Earthwork', desc: 'Regular excavation, dressed and disposed', unit: '1000 Cft', rate: 9559.70, weight: 0.10 },
    { section: 'Earthwork', desc: 'Formation of embankment, 90% modified AASHTO', unit: '1000 Cft', rate: 11278.42, weight: 0.14 },
    { section: 'Sub-base & Base', desc: 'Granular sub-base, 95–100% AASHTO density', unit: '1000 Cft', rate: 2045.45, weight: 0.16 },
    { section: 'Sub-base & Base', desc: 'Aggregate base course, crushed stone', unit: '100 Cft', rate: 21127.22, weight: 0.20 },
    { section: 'Surfacing', desc: 'Bituminous priming coat', unit: '100 Sft', rate: 2141.81, weight: 0.05 },
    { section: 'Surfacing', desc: 'Asphaltic base course (4.5% bitumen)', unit: 'Cft', rate: 894.65, weight: 0.14 },
    { section: 'Surfacing', desc: 'Asphaltic wearing course (3.5% bitumen)', unit: 'Cft', rate: 919.98, weight: 0.15 },
  ]},
  { no: '2', name: 'Culverts', share: 0.0442, items: [
    { section: 'Concrete', desc: 'Plain cement concrete, ratio 1:4:8', unit: '100 Cft', rate: 40613.98, weight: 0.25 },
    { section: 'Concrete', desc: 'Reinforced cement concrete, ratio 1:2:4', unit: '100 Cft', rate: 44500.00, weight: 0.45 },
    { section: 'Steel', desc: 'Mild steel reinforcement, cut, bent and fixed', unit: 'Kg', rate: 195.00, weight: 0.30 },
  ]},
  { no: '3', name: 'Electrical Work', share: 0.0804, items: [
    { section: 'Lighting', desc: 'Supply & erection of 12 m street-light pole', unit: 'Each', rate: 185000.00, weight: 0.40 },
    { section: 'Lighting', desc: 'LED luminaire, 150 W, complete', unit: 'Each', rate: 42000.00, weight: 0.25 },
    { section: 'Cabling', desc: 'XLPE armoured cable in trench, 4c×35 mm²', unit: 'Rft', rate: 980.00, weight: 0.35 },
  ]},
  { no: '4', name: 'Storm Water Drain', share: 0.1425, items: [
    { section: 'Excavation', desc: 'Excavation for drain in all soils', unit: '1000 Cft', rate: 9559.70, weight: 0.18 },
    { section: 'Concrete', desc: 'PCC bedding, ratio 1:4:8', unit: '100 Cft', rate: 40613.98, weight: 0.22 },
    { section: 'Pipe', desc: 'RCC pipe culvert, 36" dia, laid & jointed', unit: 'Rft', rate: 6850.00, weight: 0.38 },
    { section: 'Masonry', desc: 'Stone masonry in CM 1:4 for head/wing walls', unit: '100 Cft', rate: 38000.00, weight: 0.22 },
  ]},
  { no: '5', name: 'Water Supply Network', share: 0.0823, items: [
    { section: 'Pipe', desc: 'DI pipe 6" dia, laid, jointed & tested', unit: 'Rft', rate: 4735.96, weight: 0.34 },
    { section: 'Pipe', desc: 'DI pipe 4" dia, laid, jointed & tested', unit: 'Rft', rate: 2979.68, weight: 0.26 },
    { section: 'Pipe', desc: 'DI pipe 3" dia, laid, jointed & tested', unit: 'Rft', rate: 2252.75, weight: 0.18 },
    { section: 'Fittings', desc: 'Sluice valve with chamber, complete', unit: 'Each', rate: 165000.00, weight: 0.22 },
  ]},
  { no: '6', name: 'Sewerage System', share: 0.1276, items: [
    { section: 'Excavation', desc: 'Excavation for sewer in all soils', unit: '1000 Cft', rate: 9559.70, weight: 0.20 },
    { section: 'Pipe', desc: 'RCC sewer pipe, 24" dia, laid & jointed', unit: 'Rft', rate: 4850.00, weight: 0.42 },
    { section: 'Manhole', desc: 'Brick manhole 4\'×4\', complete with cover', unit: 'Each', rate: 95000.00, weight: 0.38 },
  ]},
  { no: '7', name: 'Landscaping', share: 0.0028, items: [
    { section: 'Softscape', desc: 'Supply & spreading of imported topsoil', unit: '100 Cft', rate: 9800.00, weight: 0.5 },
    { section: 'Softscape', desc: 'Turfing with grass, complete', unit: 'Sft', rate: 38.00, weight: 0.5 },
  ]},
  { no: '8', name: 'Area Grading', share: 0.0304, items: [
    { section: 'Earthwork', desc: 'Cut to fill, spread & compacted', unit: '1000 Cft', rate: 8751.95, weight: 0.6 },
    { section: 'Earthwork', desc: 'Compaction of natural ground', unit: '1000 Sft', rate: 1726.87, weight: 0.4 },
  ]},
  { no: '9', name: 'Sui Gas & Telephone', share: 0.0254, items: [
    { section: 'Ducting', desc: 'PVC duct bank for telephone, 4-way', unit: 'Rft', rate: 1180.00, weight: 0.5 },
    { section: 'Chambers', desc: 'Brick chamber for gas/telephone, complete', unit: 'Each', rate: 48000.00, weight: 0.5 },
  ]},
  { no: '10', name: 'Demolition of Existing', share: 0.0156, items: [
    { section: 'Demolition', desc: 'Dismantling of existing RCC, with disposal', unit: '100 Cft', rate: 12500.00, weight: 0.6 },
    { section: 'Demolition', desc: 'Dismantling of existing road crust', unit: '1000 Sft', rate: 4200.00, weight: 0.4 },
  ]},
  { no: '11', name: 'Commercial Area Development', share: 0.0179, items: [
    { section: 'Civil', desc: 'RCC raft & columns, ratio 1:2:4', unit: '100 Cft', rate: 44500.00, weight: 0.55 },
    { section: 'Finishes', desc: 'Interlocking paver, 60 mm, laid', unit: 'Sft', rate: 229.54, weight: 0.45 },
  ]},
  { no: '12', name: 'Stream / River Training', share: 0.0342, items: [
    { section: 'Protection', desc: 'Gabion box 2×1×1 m, filled & placed', unit: 'Each', rate: 18500.00, weight: 0.45 },
    { section: 'Lining', desc: 'Nullah lining, stone masonry in CM 1:4', unit: '100 Cft', rate: 38000.00, weight: 0.35 },
    { section: 'Concrete', desc: 'PCC apron, ratio 1:3:6', unit: '100 Cft', rate: 36000.00, weight: 0.20 },
  ]},
];

/** Subcontractor trades mapped to the bills they typically execute (sublet). */
export const SUB_PROFILES = [
  { trade: 'Earthworks & grading', kind: 'sublet' as const, bills: ['1', '8'], pec: 'C-A' },
  { trade: 'Bituminous & paving', kind: 'sublet' as const, bills: ['1'], pec: 'C-3' },
  { trade: 'RCC structures & culverts', kind: 'sublet' as const, bills: ['2', '11', '12'], pec: 'C-4' },
  { trade: 'Wet utilities (WS/Sewer/SWD)', kind: 'sublet' as const, bills: ['4', '5', '6'], pec: 'C-5' },
  { trade: 'Electrical & external services', kind: 'labor' as const, bills: ['3', '9'], pec: 'C-5' },
];

/** A pool of plausible sub firm names; the generator picks deterministically. */
export const SUB_NAMES = [
  'Frontier Works Org (FWO)', 'Sardar & Sons', 'Reliable Construction', 'Maqbool Associates',
  'Habib Construction Services', 'Zahir Khan & Brothers', 'Banu Mukhtar', 'Sachal Engineering',
  'Husnain Cotex', 'ECIL Pakistan', 'Ammar Builders', 'Calson Pakistan',
];
