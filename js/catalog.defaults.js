/*
 * Kodiak Single-Ply Roofing Estimator — default catalog + editor schema
 * (js/catalog.defaults.js — DOM-free, loadable as classic <script> or via require())
 *
 * *** EVERY NUMBER IS A SAMPLE PLACEHOLDER, not a real Kodiak cost — edit on
 * *** the Catalog & Rates tab. Until the catalog is saved as customized, the
 * *** UI shows "SAMPLE RATES" warnings and printouts are watermarked.
 *
 * Design rule (deliberate): this catalog contains NO wind-uplift fastening
 * densities anywhere. Field / perimeter / corner densities are per-estimate
 * user inputs backed by a manufacturer-approved assembly reference — the tool
 * never supplies a default density.
 *
 * KRE_DEFAULT_CATALOG — the data (all prices/rates editable).
 * KRE_CATALOG_SCHEMA  — array of group descriptors that drives the catalog
 *                       editor UI (tables for keyed collections, fieldsets
 *                       for scalar groups).
 */

var KRE_DEFAULT_CATALOG = {
  meta: { schemaVersion: 1, customized: false },

  labor: {
    baseRate: 82,        // $/hr fully burdened crew rate (SAMPLE)
    prevailingMult: 1.45 // multiplier applied when project.prevailingWage
  },

  // Membranes — costPerSquare is $ per 100 sqft of membrane. Rolls are
  // purchased whole; flashing membrane is cut from the same rolls.
  membranes: {
    'tpo-45':  { label: 'TPO 45-mil',  type: 'TPO',  mil: 45, rollWidthFt: 10, rollLengthFt: 100, costPerSquare: 72,  seamMethod: 'weld', seamMatPerSquare: 0,  wasteDefaultPct: 10 },
    'tpo-60':  { label: 'TPO 60-mil',  type: 'TPO',  mil: 60, rollWidthFt: 10, rollLengthFt: 100, costPerSquare: 92,  seamMethod: 'weld', seamMatPerSquare: 0,  wasteDefaultPct: 10 },
    'tpo-80':  { label: 'TPO 80-mil',  type: 'TPO',  mil: 80, rollWidthFt: 10, rollLengthFt: 100, costPerSquare: 118, seamMethod: 'weld', seamMatPerSquare: 0,  wasteDefaultPct: 10 },
    'pvc-45':  { label: 'PVC 45-mil',  type: 'PVC',  mil: 45, rollWidthFt: 10, rollLengthFt: 100, costPerSquare: 104, seamMethod: 'weld', seamMatPerSquare: 0,  wasteDefaultPct: 10 },
    'pvc-60':  { label: 'PVC 60-mil',  type: 'PVC',  mil: 60, rollWidthFt: 10, rollLengthFt: 100, costPerSquare: 128, seamMethod: 'weld', seamMatPerSquare: 0,  wasteDefaultPct: 10 },
    'pvc-80':  { label: 'PVC 80-mil',  type: 'PVC',  mil: 80, rollWidthFt: 10, rollLengthFt: 100, costPerSquare: 156, seamMethod: 'weld', seamMatPerSquare: 0,  wasteDefaultPct: 10 },
    'epdm-45': { label: 'EPDM 45-mil', type: 'EPDM', mil: 45, rollWidthFt: 10, rollLengthFt: 100, costPerSquare: 84,  seamMethod: 'tape', seamMatPerSquare: 12, wasteDefaultPct: 10 },
    'epdm-60': { label: 'EPDM 60-mil', type: 'EPDM', mil: 60, rollWidthFt: 10, rollLengthFt: 100, costPerSquare: 102, seamMethod: 'tape', seamMatPerSquare: 12, wasteDefaultPct: 10 },
    'epdm-60-wide': { label: 'EPDM 60-mil wide sheet', type: 'EPDM', mil: 60, rollWidthFt: 20, rollLengthFt: 100, costPerSquare: 106, seamMethod: 'tape', seamMatPerSquare: 9, wasteDefaultPct: 8 },
    'epdm-80': { label: 'EPDM 80-mil', type: 'EPDM', mil: 80, rollWidthFt: 10, rollLengthFt: 100, costPerSquare: 128, seamMethod: 'tape', seamMatPerSquare: 12, wasteDefaultPct: 10 }
  },

  // Flat-stock insulation boards (4'x8' = 32 sqft). 'iso-tapered' is priced
  // per inch of average thickness per sqft (budget shortcut for tapered
  // systems — a real tapered layout supersedes it).
  insulations: {
    'iso-15': { label: 'Polyiso 1.5"', thicknessIn: 1.5, boardSqft: 32, costPerBoard: 21, rPerInch: 5.7, wastePct: 5 },
    'iso-20': { label: 'Polyiso 2.0"', thicknessIn: 2.0, boardSqft: 32, costPerBoard: 27, rPerInch: 5.7, wastePct: 5 },
    'iso-26': { label: 'Polyiso 2.6"', thicknessIn: 2.6, boardSqft: 32, costPerBoard: 34, rPerInch: 5.7, wastePct: 5 },
    'iso-30': { label: 'Polyiso 3.0"', thicknessIn: 3.0, boardSqft: 32, costPerBoard: 39, rPerInch: 5.7, wastePct: 5 },
    'iso-tapered': { label: 'Tapered polyiso (avg-thickness budget)', pricing: 'perInchSqft', costPerInchSqft: 0.85, rPerInch: 5.7, wastePct: 5 }
  },

  coverBoards: {
    'hd-iso-05':   { label: '1/2" HD polyiso cover board',   thicknessIn: 0.5,  boardSqft: 32, costPerBoard: 24, wastePct: 5 },
    'gypsum-025':  { label: '1/4" glass-mat gypsum board',    thicknessIn: 0.25, boardSqft: 32, costPerBoard: 26, wastePct: 5 },
    'gypsum-05':   { label: '1/2" glass-mat gypsum board',    thicknessIn: 0.5,  boardSqft: 32, costPerBoard: 31, wastePct: 5 }
  },

  vaporRetarders: {
    'sa-vb':     { label: 'Self-adhered vapor barrier',  costPerSquare: 55 },
    'poly-6mil': { label: '6-mil poly slip sheet',       costPerSquare: 9 }
  },

  // HD screws — the engine auto-picks the cheapest fastener whose length
  // covers stack thickness + deck embedment. Densities are NOT here.
  fasteners: {
    'hd-4': { label: '#15 HD screw 4"', lengthIn: 4, costEach: 0.18, boxQty: 1000 },
    'hd-5': { label: '#15 HD screw 5"', lengthIn: 5, costEach: 0.22, boxQty: 1000 },
    'hd-6': { label: '#15 HD screw 6"', lengthIn: 6, costEach: 0.28, boxQty: 500 },
    'hd-8': { label: '#15 HD screw 8"', lengthIn: 8, costEach: 0.38, boxQty: 500 }
  },

  // role: 'insulation' plates go with insulation fastening, 'seam' plates
  // with mechanically-attached membrane fastening.
  plates: {
    'plate-ins-3':   { label: '3" galvalume insulation plate', role: 'insulation', costEach: 0.12, boxQty: 1000 },
    'plate-seam-24': { label: '2-3/8" barbed seam plate',      role: 'seam',       costEach: 0.16, boxQty: 1000 }
  },

  // Fastener embedment into the deck, by deck type (inches).
  deckEmbedment: { steel: 1.0, wood: 1.0, concrete: 1.25, gypsum: 2.0 },

  // Bonding adhesives — coverage is finished sqft per gallon.
  adhesives: {
    'ba-solvent-5': { label: 'Solvent bonding adhesive (5-gal pail)', costPerPail: 290, palGal: 5, coverageSqftPerGal: 60 },
    'ba-lvoc-5':    { label: 'Low-VOC bonding adhesive (5-gal pail)', costPerPail: 320, palGal: 5, coverageSqftPerGal: 55 }
  },

  ballasts: {
    'rock-10': { label: 'River rock ballast — 10 psf', lbsPerSqft: 10, costPerTon: 46 },
    'rock-13': { label: 'River rock ballast — 13 psf', lbsPerSqft: 13, costPerTon: 46 }
  },

  // Shop sheet metal, installed material $ per LF (labor separate in prodRates).
  flashings: {
    edge:    9.5,   // $/LF gravel-stop / drip edge
    coping:  14.0,  // $/LF parapet coping
    termBar: 3.5    // $/LF termination bar w/ sealant
  },

  // Detail material cost, $ each (labor hrs each live in prodRates).
  details: {
    pipe:     { label: 'Pipe penetration / boot',      costEach: 45 },
    curb:     { label: 'Curb flashing (mech / RTU)',   costEach: 190 },
    skylight: { label: 'Skylight curb flashing',       costEach: 260 },
    hvac:     { label: 'HVAC unit flashing',           costEach: 220 },
    drain:    { label: 'Roof drain (insert + flash)',  costEach: 425 },
    scupper:  { label: 'Scupper (line + flash)',       costEach: 210 }
  },

  // Labor production rates. hrs/sq = crew hours per 100 sqft.
  prodRates: {
    insulationHrsPerSq:       0.35, // per layer
    coverBoardHrsPerSq:       0.30,
    vaporRetarderHrsPerSq:    0.25,
    taperedHrsPerSq:          0.45,
    membraneMechHrsPerSq:     0.90,
    membraneAdheredHrsPerSq:  1.20,
    membraneBallastHrsPerSq:  0.70,
    seamTapeAddHrsPerSq:      0.25, // EPDM taped-seam adder
    ballastSpreadHrsPerSq:    0.50,
    wallFlashHrsPerLF:        0.12,
    edgeMetalHrsPerLF:        0.08,
    pipeHrsEach:              0.75,
    curbHrsEach:              2.50,
    skylightHrsEach:          3.00,
    hvacHrsEach:              2.50,
    drainHrsEach:             2.00,
    scupperHrsEach:           1.50
  },

  // Tear-off table: weight and demo labor by existing roof type.
  existingRoofs: {
    'bur-gravel': { label: 'BUR with gravel',      lbsPerSqft: 6.0, tearoffHrsPerSq: 1.4 },
    'bur':        { label: 'BUR (smooth surface)', lbsPerSqft: 4.0, tearoffHrsPerSq: 1.1 },
    'single-ply': { label: 'Single-ply',           lbsPerSqft: 1.5, tearoffHrsPerSq: 0.6 },
    'mod-bit':    { label: 'Modified bitumen',     lbsPerSqft: 2.5, tearoffHrsPerSq: 0.9 }
  },

  // Unit-priced allowance rates ($/sqft), kept separate from % contingency.
  allowances: {
    wetInsPerSqft: 3.50,
    deckRepairPerSqft: 12.00
  },

  equipment: {
    craneDay: 1800,       // $/day crane w/ operator
    forkliftDay: 650,     // $/day telehandler/forklift rental
    mobilization: 1200,   // flat per project
    dumpster: { perPull: 650, perTon: 95, capacityTons: 10 }
  },

  factors: {
    storyAddPct: 3,        // labor % added per story above the first
    tightAccessPct: 10,    // labor % added when access is tight
    flashLapAllowFt: 0.5,  // extra flashing height for lap/termination
    zoneSplitDefault: { fieldPct: 80, perimPct: 15, cornerPct: 5 }
  },

  markupDefaults: {
    overheadPct: 10,
    profitPct: 10,
    contingencyPct: 0,
    materialTaxPct: 8.25
  },

  /* System templates — named, reusable assembly stacks an estimator assigns
     per roof section (or applies to the whole estimate). Each is a SPARSE
     assembly object deep-merged over the estimate's assembly, so anything a
     template omits (zone split, fastening densities, assembly reference) is
     inherited rather than overwritten — densities stay user-entered per the
     liability rule. Ballasted templates carry explicit 0 densities because
     loose-laid is the definition of that system. Managed from the Assembly
     card ("Save current as template"), not the rates editor. */
  systemTemplates: {
    'tpo60-ma': {
      label: 'TPO 60-mil — Mechanically Attached',
      assembly: {
        vaporRetarder: null, insulationLayers: [{ productKey: 'iso-26' }],
        tapered: null, coverBoard: null, membraneKey: 'tpo-60',
        attachment: { method: 'mech' }
      }
    },
    'tpo60-fa': {
      label: 'TPO 60-mil — Fully Adhered',
      assembly: {
        vaporRetarder: null,
        insulationLayers: [{ productKey: 'iso-26' }, { productKey: 'iso-20' }],
        tapered: null, coverBoard: 'hd-iso-05', membraneKey: 'tpo-60',
        attachment: { method: 'adhered', adhesiveKey: 'ba-lvoc-5' }
      }
    },
    'pvc60-ma': {
      label: 'PVC 60-mil — Mechanically Attached',
      assembly: {
        vaporRetarder: null, insulationLayers: [{ productKey: 'iso-26' }],
        tapered: null, coverBoard: null, membraneKey: 'pvc-60',
        attachment: { method: 'mech' }
      }
    },
    'epdm60-ballast': {
      label: 'EPDM 60-mil — Ballasted (loose-laid)',
      assembly: {
        vaporRetarder: null, insulationLayers: [{ productKey: 'iso-26' }],
        tapered: null, coverBoard: null, membraneKey: 'epdm-60-wide',
        attachment: {
          method: 'ballast', ballastKey: 'rock-10',
          // Insulation zeros are load-bearing: without them a ballasted section
          // would inherit the estimate's mech densities and price fasteners on a
          // loose-laid system. (membraneDensity is only read for method 'mech'.)
          insulationDensity: { fieldPerBoard: 0, perimPerBoard: 0, cornerPerBoard: 0 }
        }
      }
    }
  }
};

/* ------------------------------------------------------------------ *
 * KRE_CATALOG_SCHEMA — drives the Catalog & Rates editor.
 *   {kind:'table',  title, path, keyed:true, canAddRows, columns:[{key,label,type:'str'|'num',step?,unit?}]}
 *   {kind:'fields', title, fields:[{path,label,step?,unit?}]}
 * ------------------------------------------------------------------ */

var KRE_CATALOG_SCHEMA = [
  { kind: 'table', title: 'Membranes', path: 'membranes', keyed: true, canAddRows: true,
    columns: [
      { key: 'label',            label: 'Name',        type: 'str' },
      { key: 'type',             label: 'Type',        type: 'str' },
      { key: 'mil',              label: 'Mil',         type: 'num', step: 5 },
      { key: 'rollWidthFt',      label: 'Roll width',  type: 'num', step: 1,    unit: 'ft' },
      { key: 'rollLengthFt',     label: 'Roll length', type: 'num', step: 1,    unit: 'ft' },
      { key: 'costPerSquare',    label: 'Cost',        type: 'num', step: 0.01, unit: '$/sq' },
      { key: 'seamMethod',       label: 'Seam (weld/tape)', type: 'str' },
      { key: 'seamMatPerSquare', label: 'Seam mat',    type: 'num', step: 0.01, unit: '$/sq' },
      { key: 'wasteDefaultPct',  label: 'Waste',       type: 'num', step: 1,    unit: '%' }
    ] },

  { kind: 'table', title: 'Insulations', path: 'insulations', keyed: true, canAddRows: true,
    columns: [
      { key: 'label',           label: 'Name',           type: 'str' },
      { key: 'thicknessIn',     label: 'Thickness',      type: 'num', step: 0.1,  unit: 'in' },
      { key: 'boardSqft',       label: 'Board size',     type: 'num', step: 1,    unit: 'sqft' },
      { key: 'costPerBoard',    label: 'Cost',           type: 'num', step: 0.01, unit: '$/board' },
      { key: 'rPerInch',        label: 'R / inch',       type: 'num', step: 0.1 },
      { key: 'wastePct',        label: 'Waste',          type: 'num', step: 1,    unit: '%' },
      { key: 'pricing',         label: 'Pricing (blank or perInchSqft)', type: 'str' },
      { key: 'costPerInchSqft', label: 'Tapered cost',   type: 'num', step: 0.01, unit: '$/in/sqft' }
    ] },

  { kind: 'table', title: 'Cover boards', path: 'coverBoards', keyed: true, canAddRows: true,
    columns: [
      { key: 'label',        label: 'Name',      type: 'str' },
      { key: 'thicknessIn',  label: 'Thickness', type: 'num', step: 0.05, unit: 'in' },
      { key: 'boardSqft',    label: 'Board size',type: 'num', step: 1,    unit: 'sqft' },
      { key: 'costPerBoard', label: 'Cost',      type: 'num', step: 0.01, unit: '$/board' },
      { key: 'wastePct',     label: 'Waste',     type: 'num', step: 1,    unit: '%' }
    ] },

  { kind: 'table', title: 'Vapor retarders', path: 'vaporRetarders', keyed: true, canAddRows: true,
    columns: [
      { key: 'label',         label: 'Name', type: 'str' },
      { key: 'costPerSquare', label: 'Cost', type: 'num', step: 0.01, unit: '$/sq' }
    ] },

  { kind: 'table', title: 'Fasteners (length auto-picked by the engine)', path: 'fasteners', keyed: true, canAddRows: true,
    columns: [
      { key: 'label',    label: 'Name',    type: 'str' },
      { key: 'lengthIn', label: 'Length',  type: 'num', step: 0.5,  unit: 'in' },
      { key: 'costEach', label: 'Cost',    type: 'num', step: 0.01, unit: '$/ea' },
      { key: 'boxQty',   label: 'Box qty', type: 'num', step: 50 }
    ] },

  { kind: 'table', title: 'Plates', path: 'plates', keyed: true, canAddRows: true,
    columns: [
      { key: 'label',    label: 'Name',                     type: 'str' },
      { key: 'role',     label: 'Role (insulation/seam)',   type: 'str' },
      { key: 'costEach', label: 'Cost',                     type: 'num', step: 0.01, unit: '$/ea' },
      { key: 'boxQty',   label: 'Box qty',                  type: 'num', step: 50 }
    ] },

  { kind: 'table', title: 'Bonding adhesives', path: 'adhesives', keyed: true, canAddRows: true,
    columns: [
      { key: 'label',              label: 'Name',      type: 'str' },
      { key: 'costPerPail',        label: 'Cost',      type: 'num', step: 0.01, unit: '$/pail' },
      { key: 'palGal',             label: 'Pail size', type: 'num', step: 1,    unit: 'gal' },
      { key: 'coverageSqftPerGal', label: 'Coverage',  type: 'num', step: 1,    unit: 'sqft/gal (finished)' }
    ] },

  { kind: 'table', title: 'Ballast', path: 'ballasts', keyed: true, canAddRows: true,
    columns: [
      { key: 'label',      label: 'Name',   type: 'str' },
      { key: 'lbsPerSqft', label: 'Weight', type: 'num', step: 0.5,  unit: 'lbs/sqft' },
      { key: 'costPerTon', label: 'Cost',   type: 'num', step: 0.01, unit: '$/ton' }
    ] },

  { kind: 'table', title: 'Existing roofs (tear-off)', path: 'existingRoofs', keyed: true, canAddRows: true,
    columns: [
      { key: 'label',           label: 'Name',       type: 'str' },
      { key: 'lbsPerSqft',      label: 'Weight',     type: 'num', step: 0.1,  unit: 'lbs/sqft/layer' },
      { key: 'tearoffHrsPerSq', label: 'Demo labor', type: 'num', step: 0.05, unit: 'hrs/sq/layer' }
    ] },

  { kind: 'table', title: 'Detail materials', path: 'details', keyed: true, canAddRows: false,
    columns: [
      { key: 'label',    label: 'Detail', type: 'str' },
      { key: 'costEach', label: 'Cost',   type: 'num', step: 0.01, unit: '$/ea' }
    ] },

  { kind: 'fields', title: 'Labor', fields: [
      { path: 'labor.baseRate',       label: 'Base crew rate',            step: 0.5,  unit: '$/hr' },
      { path: 'labor.prevailingMult', label: 'Prevailing-wage multiplier', step: 0.05, unit: '×' }
    ] },

  { kind: 'fields', title: 'Sheet metal / flashings', fields: [
      { path: 'flashings.edge',    label: 'Edge metal / gravel stop', step: 0.25, unit: '$/LF' },
      { path: 'flashings.coping',  label: 'Parapet coping',           step: 0.25, unit: '$/LF' },
      { path: 'flashings.termBar', label: 'Termination bar',          step: 0.25, unit: '$/LF' }
    ] },

  { kind: 'fields', title: 'Production rates', fields: [
      { path: 'prodRates.insulationHrsPerSq',      label: 'Insulation (per layer)',       step: 0.05, unit: 'hrs/sq' },
      { path: 'prodRates.coverBoardHrsPerSq',      label: 'Cover board',                  step: 0.05, unit: 'hrs/sq' },
      { path: 'prodRates.vaporRetarderHrsPerSq',   label: 'Vapor retarder',               step: 0.05, unit: 'hrs/sq' },
      { path: 'prodRates.taperedHrsPerSq',         label: 'Tapered insulation',           step: 0.05, unit: 'hrs/sq' },
      { path: 'prodRates.membraneMechHrsPerSq',    label: 'Membrane — mech attached',     step: 0.05, unit: 'hrs/sq' },
      { path: 'prodRates.membraneAdheredHrsPerSq', label: 'Membrane — fully adhered',     step: 0.05, unit: 'hrs/sq' },
      { path: 'prodRates.membraneBallastHrsPerSq', label: 'Membrane — ballasted (lay)',   step: 0.05, unit: 'hrs/sq' },
      { path: 'prodRates.seamTapeAddHrsPerSq',     label: 'EPDM seam tape adder',         step: 0.05, unit: 'hrs/sq' },
      { path: 'prodRates.ballastSpreadHrsPerSq',   label: 'Ballast spreading',            step: 0.05, unit: 'hrs/sq' },
      { path: 'prodRates.wallFlashHrsPerLF',       label: 'Wall flashing membrane',       step: 0.01, unit: 'hrs/LF' },
      { path: 'prodRates.edgeMetalHrsPerLF',       label: 'Edge metal install',           step: 0.01, unit: 'hrs/LF' },
      { path: 'prodRates.pipeHrsEach',             label: 'Pipe penetration',             step: 0.25, unit: 'hrs/ea' },
      { path: 'prodRates.curbHrsEach',             label: 'Curb flashing',                step: 0.25, unit: 'hrs/ea' },
      { path: 'prodRates.skylightHrsEach',         label: 'Skylight flashing',            step: 0.25, unit: 'hrs/ea' },
      { path: 'prodRates.hvacHrsEach',             label: 'HVAC flashing',                step: 0.25, unit: 'hrs/ea' },
      { path: 'prodRates.drainHrsEach',            label: 'Roof drain',                   step: 0.25, unit: 'hrs/ea' },
      { path: 'prodRates.scupperHrsEach',          label: 'Scupper',                      step: 0.25, unit: 'hrs/ea' }
    ] },

  { kind: 'fields', title: 'Allowance rates (unit-priced)', fields: [
      { path: 'allowances.wetInsPerSqft',     label: 'Wet insulation replacement', step: 0.25, unit: '$/sqft' },
      { path: 'allowances.deckRepairPerSqft', label: 'Deck repair',                step: 0.25, unit: '$/sqft' }
    ] },

  { kind: 'fields', title: 'Equipment & disposal', fields: [
      { path: 'equipment.craneDay',              label: 'Crane (with operator)', step: 50, unit: '$/day' },
      { path: 'equipment.forkliftDay',           label: 'Forklift / telehandler', step: 25, unit: '$/day' },
      { path: 'equipment.mobilization',          label: 'Mobilization (flat)',   step: 50, unit: '$' },
      { path: 'equipment.dumpster.perPull',      label: 'Dumpster pull',         step: 25, unit: '$/pull' },
      { path: 'equipment.dumpster.perTon',       label: 'Disposal tipping',      step: 5,  unit: '$/ton' },
      { path: 'equipment.dumpster.capacityTons', label: 'Dumpster capacity',     step: 1,  unit: 'tons' }
    ] },

  { kind: 'fields', title: 'Job factors', fields: [
      { path: 'factors.storyAddPct',                label: 'Labor add per story above 1st', step: 0.5,  unit: '%' },
      { path: 'factors.tightAccessPct',             label: 'Tight-access labor add',        step: 0.5,  unit: '%' },
      { path: 'factors.flashLapAllowFt',            label: 'Flashing lap allowance',        step: 0.25, unit: 'ft' },
      { path: 'factors.zoneSplitDefault.fieldPct',  label: 'Default zone split — field',    step: 1,    unit: '%' },
      { path: 'factors.zoneSplitDefault.perimPct',  label: 'Default zone split — perimeter',step: 1,    unit: '%' },
      { path: 'factors.zoneSplitDefault.cornerPct', label: 'Default zone split — corner',   step: 1,    unit: '%' }
    ] },

  { kind: 'fields', title: 'Markup defaults (seed new estimates)', fields: [
      { path: 'markupDefaults.overheadPct',    label: 'Overhead',     step: 0.5,  unit: '%' },
      { path: 'markupDefaults.profitPct',      label: 'Profit',       step: 0.5,  unit: '%' },
      { path: 'markupDefaults.contingencyPct', label: 'Contingency',  step: 0.5,  unit: '%' },
      { path: 'markupDefaults.materialTaxPct', label: 'Material tax', step: 0.25, unit: '%' }
    ] },

  { kind: 'fields', title: 'Deck embedment (fastener penetration into deck)', fields: [
      { path: 'deckEmbedment.steel',    label: 'Steel deck',    step: 0.25, unit: 'in' },
      { path: 'deckEmbedment.wood',     label: 'Wood deck',     step: 0.25, unit: 'in' },
      { path: 'deckEmbedment.concrete', label: 'Concrete deck', step: 0.25, unit: 'in' },
      { path: 'deckEmbedment.gypsum',   label: 'Gypsum deck',   step: 0.25, unit: 'in' }
    ] }
];

if (typeof module !== 'undefined') module.exports = { KRE_DEFAULT_CATALOG: KRE_DEFAULT_CATALOG, KRE_CATALOG_SCHEMA: KRE_CATALOG_SCHEMA };
if (typeof window !== 'undefined') { window.KRE = window.KRE || {}; window.KRE.defaults = { KRE_DEFAULT_CATALOG: KRE_DEFAULT_CATALOG, KRE_CATALOG_SCHEMA: KRE_CATALOG_SCHEMA }; }
