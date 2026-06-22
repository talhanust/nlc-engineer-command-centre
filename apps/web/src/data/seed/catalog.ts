// Bill structure and item catalogue distilled from the real F-14/F-15 Islamabad
// BOQ (MRS 2nd Bi-Annual, Rs. 19.58 bn). Shares are each bill's fraction of the
// contract value; items carry authentic descriptions, units and MRS rates. The
// seed generator scales quantities so each bill totals share × contract value.
// Major bills (Road Work, SWD, Water Supply, Sewerage) are expanded to full item
// depth; minor bills carry their representative items.

export interface CatalogItem { desc: string; unit: string; rate: number; weight: number; section: string }
export interface CatalogBill { no: string; name: string; share: number; items: CatalogItem[] }

export const BILLS: CatalogBill[] = [
  { no: '1', name: 'Road Work', share: 0.3966, items: [
    // Earthwork
    { section: 'Earthwork', desc: 'Clearing and grubbing', unit: '1000 Sft', rate: 5564.11, weight: 0.04 },
    { section: 'Earthwork', desc: 'Uprooting Sarkanda growth and disposal within 100 ft', unit: '100 Sft', rate: 222.19, weight: 0.01 },
    { section: 'Earthwork', desc: 'Felling trees up to 2½ ft girth', unit: 'Each', rate: 2765.81, weight: 0.005 },
    { section: 'Earthwork', desc: 'Regular excavation, dressed and disposed', unit: '1000 Cft', rate: 9559.70, weight: 0.07 },
    { section: 'Earthwork', desc: 'Transportation of earth, all types (with lead)', unit: '1000 Cft', rate: 8751.95, weight: 0.05 },
    { section: 'Earthwork', desc: 'Formation of embankment, 90% modified AASHTO', unit: '1000 Cft', rate: 11278.42, weight: 0.10 },
    { section: 'Earthwork', desc: 'Improved subgrade preparation', unit: 'Cft', rate: 115.00, weight: 0.04 },
    { section: 'Earthwork', desc: 'Subgrade preparation, 95–100% modified AASHTO', unit: '1000 Cft', rate: 2045.45, weight: 0.04 },
    // Sub-base & Base
    { section: 'Sub-base & Base', desc: 'Granular sub-base, crushed stone', unit: '100 Cft', rate: 17142.07, weight: 0.10 },
    { section: 'Sub-base & Base', desc: 'Aggregate base course, laid and compacted', unit: '100 Cft', rate: 21127.22, weight: 0.13 },
    // Surfacing
    { section: 'Surfacing', desc: 'Bituminous priming coat', unit: '100 Sft', rate: 2141.81, weight: 0.03 },
    { section: 'Surfacing', desc: 'Bituminous tack coat', unit: '100 Sft', rate: 1180.08, weight: 0.02 },
    { section: 'Surfacing', desc: 'Asphaltic base course (4.5% bitumen)', unit: 'Cft', rate: 894.65, weight: 0.10 },
    { section: 'Surfacing', desc: 'Asphaltic wearing course (3.5% bitumen)', unit: 'Cft', rate: 919.98, weight: 0.10 },
    // Ancillary
    { section: 'Ancillary', desc: '10 m single-bent-arm octagonal galvanized lighting pole', unit: 'Each', rate: 175514.40, weight: 0.04 },
    { section: 'Ancillary', desc: 'Thermoplastic road marking, HIP tape', unit: 'Rft', rate: 1684.24, weight: 0.015 },
    { section: 'Ancillary', desc: 'Interlocking paver, 60 mm (50% grey / 50% coloured)', unit: 'Sft', rate: 229.54, weight: 0.02 },
  ]},
  { no: '2', name: 'Culverts', share: 0.0442, items: [
    { section: 'Earthwork', desc: 'Structural excavation for culverts', unit: '1000 Cft', rate: 19480.55, weight: 0.10 },
    { section: 'Concrete', desc: 'Plain cement concrete, ratio 1:4:8', unit: '100 Cft', rate: 40613.98, weight: 0.18 },
    { section: 'Concrete', desc: 'Reinforced cement concrete, ratio 1:2:4', unit: '100 Cft', rate: 44500.00, weight: 0.34 },
    { section: 'Steel', desc: 'Mild steel reinforcement, cut, bent and fixed', unit: 'Kg', rate: 195.00, weight: 0.24 },
    { section: 'Finishes', desc: 'Formwork / shuttering for RCC, all heights', unit: 'Sft', rate: 145.00, weight: 0.08 },
    { section: 'Waterproofing', desc: 'PVC water stopper, 250 mm wide, embedded', unit: 'Rft', rate: 930.24, weight: 0.06 },
  ]},
  { no: '3', name: 'Electrical Work', share: 0.0804, items: [
    { section: 'Lighting', desc: '12 m double-bent-arm octagonal galvanized pole', unit: 'Each', rate: 220111.20, weight: 0.30 },
    { section: 'Lighting', desc: '15 m hot-dip galvanized high-mast pole', unit: 'Each', rate: 320248.80, weight: 0.12 },
    { section: 'Lighting', desc: 'LED luminaire, 150 W, complete', unit: 'Each', rate: 42000.00, weight: 0.20 },
    { section: 'Cabling', desc: 'XLPE armoured cable in trench, 4c×35 mm²', unit: 'Rft', rate: 980.00, weight: 0.22 },
    { section: 'Cabling', desc: 'Feeder pillar / distribution box, complete', unit: 'Each', rate: 165000.00, weight: 0.10 },
    { section: 'Earthing', desc: 'Earthing pit with copper electrode, complete', unit: 'Each', rate: 38000.00, weight: 0.06 },
  ]},
  { no: '4', name: 'Storm Water Drain', share: 0.1425, items: [
    { section: 'Excavation', desc: 'Excavation of trenches in all kinds of soil', unit: '1000 Cft', rate: 11704.90, weight: 0.14 },
    { section: 'Excavation', desc: 'Rehandling / carriage of excavated material', unit: '100 Cft', rate: 4200.00, weight: 0.05 },
    { section: 'Concrete', desc: 'PCC bedding, ratio 1:4:8', unit: '100 Cft', rate: 40613.98, weight: 0.16 },
    { section: 'Concrete', desc: 'RCC for drain walls/slab, ratio 1:2:4', unit: '100 Cft', rate: 54813.82, weight: 0.18 },
    { section: 'Steel', desc: 'Mild steel reinforcement for RCC drain', unit: 'Kg', rate: 195.00, weight: 0.10 },
    { section: 'Pipe', desc: 'RCC pipe culvert, 36" dia, laid and jointed', unit: 'Rft', rate: 6850.00, weight: 0.16 },
    { section: 'Masonry', desc: 'Stone masonry in CM 1:4 for head/wing walls', unit: '100 Cft', rate: 38000.00, weight: 0.12 },
    { section: 'Finishes', desc: 'Cement plaster ½" thick on masonry', unit: '100 Sft', rate: 4450.00, weight: 0.04 },
    { section: 'Ancillary', desc: 'M.S grating with angle-iron frame, fixed', unit: 'Sft', rate: 1800.00, weight: 0.03 },
    { section: 'Ancillary', desc: 'G.I railing along drain, complete', unit: 'Rft', rate: 1578.54, weight: 0.02 },
  ]},
  { no: '5', name: 'Water Supply Network', share: 0.0823, items: [
    { section: 'Excavation', desc: 'Excavation of trench, 1.22–2.4 m depth below SSWL', unit: '1000 Cft', rate: 30500.00, weight: 0.10 },
    { section: 'Excavation', desc: 'Excavation of trench, lead up to single throw', unit: '1000 Cft', rate: 3897.89, weight: 0.06 },
    { section: 'Bedding', desc: 'Shrouding with graded pea gravel 3/8"–1/8"', unit: 'Cft', rate: 181.73, weight: 0.05 },
    { section: 'Pipe', desc: 'DI pipe 6" dia, laid, jointed and tested', unit: 'Rft', rate: 4735.96, weight: 0.20 },
    { section: 'Pipe', desc: 'DI pipe 4" dia, laid, jointed and tested', unit: 'Rft', rate: 2979.68, weight: 0.16 },
    { section: 'Pipe', desc: 'DI pipe 3" dia, laid, jointed and tested', unit: 'Rft', rate: 2252.75, weight: 0.10 },
    { section: 'Pipe', desc: 'HDPE pipe, class-rated, jointing and testing', unit: 'Rft', rate: 171.00, weight: 0.05 },
    { section: 'Fittings', desc: 'Sluice valve with chamber, complete', unit: 'Each', rate: 165000.00, weight: 0.10 },
    { section: 'Fittings', desc: 'Garden / fire hydrant, installed and tested', unit: 'Each', rate: 66349.20, weight: 0.06 },
    { section: 'Concrete', desc: 'RCC for valve chambers, ratio 1:2:4', unit: '100 Cft', rate: 44500.00, weight: 0.07 },
    { section: 'Masonry', desc: 'Brick masonry in CM 1:4 for chambers', unit: '100 Cft', rate: 39500.00, weight: 0.03 },
    { section: 'Testing', desc: 'Disinfection, flushing and hydraulic testing', unit: '1000 Cft', rate: 360.58, weight: 0.02 },
  ]},
  { no: '6', name: 'Sewerage System', share: 0.1276, items: [
    { section: 'Excavation', desc: 'Excavation of trenches in all soils', unit: '1000 Cft', rate: 12880.86, weight: 0.12 },
    { section: 'Excavation', desc: 'Rehandling of earthwork', unit: '1000 Cft', rate: 4288.68, weight: 0.05 },
    { section: 'Bedding', desc: 'Crushed stone / sand bedding, watered & rammed', unit: 'Cft', rate: 57.00, weight: 0.05 },
    { section: 'Pipe', desc: 'RCC sewer pipe, 24" dia, laid and jointed', unit: 'Rft', rate: 4850.00, weight: 0.26 },
    { section: 'Pipe', desc: 'HDPE forcemain pipe, 600 mm dia', unit: 'Rft', rate: 16118.80, weight: 0.14 },
    { section: 'Joints', desc: 'Cement caulked joint for RCC pipe', unit: 'Kg', rate: 493.68, weight: 0.03 },
    { section: 'Manhole', desc: 'Brick manhole 4\'×4\', complete with cover', unit: 'Each', rate: 95000.00, weight: 0.18 },
    { section: 'Concrete', desc: 'PCC for manhole base, ratio 1:4:8', unit: '100 Cft', rate: 40613.98, weight: 0.08 },
    { section: 'Waterproofing', desc: 'Water-proof seal coat, cementitious based', unit: 'Sft', rate: 127.17, weight: 0.05 },
    { section: 'Testing', desc: 'Ball / mandrel and infiltration testing', unit: 'Rft', rate: 95.00, weight: 0.04 },
  ]},
  { no: '7', name: 'Landscaping', share: 0.0028, items: [
    { section: 'Softscape', desc: 'Supply and spreading of imported topsoil', unit: '100 Cft', rate: 9800.00, weight: 0.35 },
    { section: 'Softscape', desc: 'Turfing with grass, complete', unit: 'Sft', rate: 38.00, weight: 0.30 },
    { section: 'Softscape', desc: 'Supply and planting of ornamental trees', unit: 'Each', rate: 5381.14, weight: 0.20 },
    { section: 'Irrigation', desc: 'Sprinkler irrigation line, laid and tested', unit: 'Rft', rate: 740.00, weight: 0.15 },
  ]},
  { no: '8', name: 'Area Grading', share: 0.0304, items: [
    { section: 'Earthwork', desc: 'Cut to fill, spread and compacted', unit: '1000 Cft', rate: 8751.95, weight: 0.45 },
    { section: 'Earthwork', desc: 'Borrow excavation and placement', unit: '1000 Cft', rate: 9559.70, weight: 0.30 },
    { section: 'Earthwork', desc: 'Compaction of natural ground', unit: '1000 Sft', rate: 1726.87, weight: 0.15 },
    { section: 'Earthwork', desc: 'Fine grading and dressing of formation', unit: '1000 Sft', rate: 462.90, weight: 0.10 },
  ]},
  { no: '9', name: 'Sui Gas & Telephone', share: 0.0254, items: [
    { section: 'Ducting', desc: 'PVC duct bank for telephone, 4-way', unit: 'Rft', rate: 1180.00, weight: 0.35 },
    { section: 'Telecom', desc: '24-port ODF with couplers, pigtails and patch cords', unit: 'No', rate: 163843.08, weight: 0.18 },
    { section: 'Telecom', desc: 'Optical distribution / junction box, IP66', unit: 'No', rate: 20064.00, weight: 0.12 },
    { section: 'Chambers', desc: 'Hand hole 0.9×0.9×0.9 m, installed', unit: 'No', rate: 58574.34, weight: 0.20 },
    { section: 'Commissioning', desc: 'Programming, testing and commissioning', unit: 'Job', rate: 257641.14, weight: 0.15 },
  ]},
  { no: '10', name: 'Demolition of Existing', share: 0.0156, items: [
    { section: 'Demolition', desc: 'Dismantling of 5-Marla house (single storey)', unit: 'Cum', rate: 1917.47, weight: 0.30 },
    { section: 'Demolition', desc: 'Dismantling of 10-Marla house (single storey)', unit: 'Cum', rate: 1917.47, weight: 0.25 },
    { section: 'Demolition', desc: 'Dismantling of 1-Kanal house (single storey)', unit: 'Cum', rate: 1917.47, weight: 0.25 },
    { section: 'Demolition', desc: 'Dismantling of existing road crust, with disposal', unit: '1000 Sft', rate: 4200.00, weight: 0.20 },
  ]},
  { no: '11', name: 'Commercial Area Development', share: 0.0179, items: [
    { section: 'Civil', desc: 'RCC raft and columns, ratio 1:2:4', unit: '100 Cft', rate: 44500.00, weight: 0.40 },
    { section: 'Civil', desc: 'Brick masonry in CM 1:4', unit: '100 Cft', rate: 39000.00, weight: 0.20 },
    { section: 'Finishes', desc: 'Walkway + parking development (30% of area)', unit: 'Sft', rate: 279.30, weight: 0.25 },
    { section: 'Finishes', desc: 'Interlocking paver, 60 mm, laid', unit: 'Sft', rate: 229.54, weight: 0.15 },
  ]},
  { no: '12', name: 'Stream / River Training', share: 0.0342, items: [
    { section: 'Earthwork', desc: 'Channel excavation and dressing', unit: '1000 Cft', rate: 9559.70, weight: 0.16 },
    { section: 'Protection', desc: 'Gabion box 2×1×1 m, filled and placed', unit: 'Each', rate: 18500.00, weight: 0.30 },
    { section: 'Lining', desc: 'Nullah lining, stone masonry in CM 1:4', unit: '100 Cft', rate: 38000.00, weight: 0.26 },
    { section: 'Concrete', desc: 'PCC apron, ratio 1:3:6', unit: '100 Cft', rate: 36000.00, weight: 0.16 },
    { section: 'Concrete', desc: 'RCC toe wall, ratio 1:2:4', unit: '100 Cft', rate: 44500.00, weight: 0.08 },
    { section: 'Finishes', desc: 'Weep holes with filter media', unit: 'Each', rate: 662.02, weight: 0.04 },
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

/** Resource pool (store/plant/equipment) used to seed the resources register. */
export const RESOURCE_POOL: Array<{ name: string; resourceClass: 'store' | 'plant' | 'equipment'; unit: string; qty: number }> = [
  { name: 'Excavator (CAT 320)', resourceClass: 'equipment', unit: 'no', qty: 4 },
  { name: 'Motor grader', resourceClass: 'equipment', unit: 'no', qty: 3 },
  { name: 'Vibratory roller, 10 t', resourceClass: 'equipment', unit: 'no', qty: 3 },
  { name: 'Asphalt paver', resourceClass: 'plant', unit: 'no', qty: 1 },
  { name: 'Dump truck, 18 cu.m', resourceClass: 'equipment', unit: 'no', qty: 12 },
  { name: 'Concrete batching plant', resourceClass: 'plant', unit: 'no', qty: 1 },
  { name: 'Crushed stone aggregate', resourceClass: 'store', unit: 'cu.ft', qty: 1_800_000 },
  { name: 'Ordinary Portland cement', resourceClass: 'store', unit: 'bag', qty: 240_000 },
  { name: 'Bitumen (60/70 grade)', resourceClass: 'store', unit: 'MT', qty: 4200 },
  { name: 'Deformed steel bar (Grade-60)', resourceClass: 'store', unit: 'MT', qty: 6500 },
];

/** Overhead categories used to seed the overheads register. */
export const OVERHEAD_CATEGORIES = [
  { category: 'Site establishment & camp', monthly: 0.0009 },
  { category: 'Project management staff', monthly: 0.0014 },
  { category: 'Site utilities & services', monthly: 0.0004 },
  { category: 'Insurance & bonds', monthly: 0.0003 },
  { category: 'Survey & QA/QC', monthly: 0.0005 },
  { category: 'Security & HSE', monthly: 0.0004 },
];
