/*
 * tests/fixtures.js — TEST_CATALOG (simple round numbers, deliberately
 * independent of KRE_DEFAULT_CATALOG so default tweaks never break tests)
 * plus the four hand-computed fixture estimates from the plan.
 */

var TEST_CATALOG = {
  meta: { schemaVersion: 1, customized: true },

  labor: { baseRate: 100, prevailingMult: 1.5 },

  membranes: {
    // TPO 60: 10x100 roll = 1000 sqft/roll; $100/sq -> $1000/roll; welded seams
    'tpo-60':  { label: 'TPO 60', type: 'TPO', mil: 60, rollWidthFt: 10, rollLengthFt: 100, costPerSquare: 100, seamMethod: 'weld', seamMatPerSquare: 0, wasteDefaultPct: 10 },
    // EPDM 60 wide: 20x100 roll = 2000 sqft/roll; $100/sq -> $2000/roll; taped seams $10/sq
    'epdm-60': { label: 'EPDM 60', type: 'EPDM', mil: 60, rollWidthFt: 20, rollLengthFt: 100, costPerSquare: 100, seamMethod: 'tape', seamMatPerSquare: 10, wasteDefaultPct: 10 }
  },

  insulations: {
    // 0% waste keeps board math exact: boards = area/32
    'iso-2': { label: 'Polyiso 2"', thicknessIn: 2, boardSqft: 32, costPerBoard: 32, rPerInch: 5, wastePct: 0 },
    'iso-tapered': { label: 'Tapered iso', pricing: 'perInchSqft', costPerInchSqft: 1, rPerInch: 5, wastePct: 0 }
  },

  coverBoards: {
    'cb-05': { label: 'Cover board 1/2"', thicknessIn: 0.5, boardSqft: 32, costPerBoard: 32, wastePct: 0 }
  },

  vaporRetarders: {
    'vb': { label: 'Vapor barrier', costPerSquare: 50 }
  },

  fasteners: {
    'f-4': { label: 'Screw 4"', lengthIn: 4, costEach: 0.2, boxQty: 1000 },
    'f-6': { label: 'Screw 6"', lengthIn: 6, costEach: 0.3, boxQty: 1000 },
    'f-8': { label: 'Screw 8"', lengthIn: 8, costEach: 0.4, boxQty: 1000 }
  },

  plates: {
    'p-ins':  { label: 'Insulation plate', role: 'insulation', costEach: 0.1, boxQty: 1000 },
    'p-seam': { label: 'Seam plate',       role: 'seam',       costEach: 0.1, boxQty: 1000 }
  },

  deckEmbedment: { steel: 1, wood: 1, concrete: 1, gypsum: 2 },

  adhesives: {
    'adh': { label: 'Bonding adhesive', costPerPail: 250, palGal: 5, coverageSqftPerGal: 50 }
  },

  ballasts: {
    'bal': { label: 'River rock', lbsPerSqft: 10, costPerTon: 50 }
  },

  flashings: { edge: 10, coping: 15, termBar: 5 },

  details: {
    pipe:     { label: 'Pipe boot',      costEach: 50 },
    curb:     { label: 'Curb flashing',  costEach: 200 },
    skylight: { label: 'Skylight',       costEach: 300 },
    hvac:     { label: 'HVAC flashing',  costEach: 250 },
    drain:    { label: 'Roof drain',     costEach: 400 },
    scupper:  { label: 'Scupper',        costEach: 200 }
  },

  prodRates: {
    insulationHrsPerSq: 0.3,
    coverBoardHrsPerSq: 0.2,
    vaporRetarderHrsPerSq: 0.2,
    taperedHrsPerSq: 0.4,
    membraneMechHrsPerSq: 1.0,
    membraneAdheredHrsPerSq: 1.5,
    membraneBallastHrsPerSq: 0.5,
    seamTapeAddHrsPerSq: 0.2,
    ballastSpreadHrsPerSq: 0.5,
    wallFlashHrsPerLF: 0.1,
    edgeMetalHrsPerLF: 0.1,
    pipeHrsEach: 1,
    curbHrsEach: 2,
    skylightHrsEach: 3,
    hvacHrsEach: 2,
    drainHrsEach: 2,
    scupperHrsEach: 1
  },

  existingRoofs: {
    'bur-gravel': { label: 'BUR w/ gravel', lbsPerSqft: 6, tearoffHrsPerSq: 1.5 },
    'bur':        { label: 'BUR',           lbsPerSqft: 5, tearoffHrsPerSq: 1 },
    'single-ply': { label: 'Single-ply',    lbsPerSqft: 2, tearoffHrsPerSq: 0.5 },
    'mod-bit':    { label: 'Mod-bit',       lbsPerSqft: 3, tearoffHrsPerSq: 1 }
  },

  allowances: { wetInsPerSqft: 5, deckRepairPerSqft: 10 },

  equipment: {
    craneDay: 2000,
    mobilization: 1000,
    dumpster: { perPull: 500, perTon: 100, capacityTons: 10 }
  },

  factors: {
    storyAddPct: 5,
    tightAccessPct: 10,
    flashLapAllowFt: 0.5,
    zoneSplitDefault: { fieldPct: 80, perimPct: 15, cornerPct: 5 }
  },

  markupDefaults: { overheadPct: 10, profitPct: 10, contingencyPct: 0, materialTaxPct: 10 }
};

/* ------------------------------------------------------------------ *
 * Fixture A — New construction, TPO-60 mechanically attached, 100 sq.
 * 1 story, no prevailing wage, no crane. Markups 10/10/0, tax 10%.
 * ------------------------------------------------------------------ */
var fixtureA = {
  schemaVersion: 1,
  project: { name: 'Fixture A', customer: 'Test Co', address: '', city: '', state: 'CA', estimator: '', bidDate: '', prevailingWage: false, stories: 1, tightAccess: false, craneDays: 0, notes: '' },
  assembly: {
    deckType: 'steel',
    vaporRetarder: null,
    insulationLayers: [{ productKey: 'iso-2' }],
    tapered: null,
    coverBoard: null,
    membraneKey: 'tpo-60',
    attachment: {
      method: 'mech',
      manufacturerAssemblyRef: 'SAMPLE FM assembly ref',
      zoneSplit: { fieldPct: 80, perimPct: 15, cornerPct: 5 },
      insulationDensity: { fieldPerBoard: 5, perimPerBoard: 8, cornerPerBoard: 12 },
      membraneDensity: { fieldPerSq: 10, perimPerSq: 15, cornerPerSq: 20 },
      adhesiveKey: null,
      ballastKey: null
    },
    membraneWastePct: null
  },
  sections: [{
    id: 'a1', name: 'Main Roof', scope: 'new',
    existingRoofKey: null, existingLayers: 1, existingStackIn: 0,
    allowanceWetInsSqft: 0, allowanceDeckRepairSqft: 0,
    fieldSquares: 100, perimeterLF: 0,
    edgeMetal: { type: 'edge', lf: 400 },
    wallFlash: { lf: 200, avgHeightFt: 1.5 },
    penetrations: { pipe: 10, curb: 2, skylight: 0, hvac: 0 },
    drains: 4, scuppers: 0,
    assemblyOverride: null, wastePctOverride: null, notes: ''
  }],
  markups: { overheadPct: 10, profitPct: 10, contingencyPct: 0, materialTaxPct: 10 }
};

/* ------------------------------------------------------------------ *
 * Fixture B — Tear-off 2-layer BUR -> TPO-60 fully adhered, 50 sq,
 * 5% contingency, 1 crane day, wet-insulation allowance 200 sqft.
 * ------------------------------------------------------------------ */
var fixtureB = {
  schemaVersion: 1,
  project: { name: 'Fixture B', customer: 'Test Co', address: '', city: '', state: 'CA', estimator: '', bidDate: '', prevailingWage: false, stories: 1, tightAccess: false, craneDays: 1, notes: '' },
  assembly: {
    deckType: 'steel',
    vaporRetarder: null,
    insulationLayers: [{ productKey: 'iso-2' }],
    tapered: null,
    coverBoard: 'cb-05',
    membraneKey: 'tpo-60',
    attachment: {
      method: 'adhered',
      manufacturerAssemblyRef: 'SAMPLE adhered assembly ref',
      zoneSplit: { fieldPct: 80, perimPct: 15, cornerPct: 5 },
      insulationDensity: { fieldPerBoard: 5, perimPerBoard: 8, cornerPerBoard: 12 },
      membraneDensity: { fieldPerSq: null, perimPerSq: null, cornerPerSq: null }, // irrelevant for adhered — must NOT error
      adhesiveKey: 'adh',
      ballastKey: null
    },
    membraneWastePct: null
  },
  sections: [{
    id: 'b1', name: 'Main Roof', scope: 'tearoff',
    existingRoofKey: 'bur', existingLayers: 2, existingStackIn: 0,
    allowanceWetInsSqft: 200, allowanceDeckRepairSqft: 0,
    fieldSquares: 50, perimeterLF: 0,
    edgeMetal: { type: 'coping', lf: 0 },
    wallFlash: { lf: 100, avgHeightFt: 2 },
    penetrations: { pipe: 0, curb: 0, skylight: 0, hvac: 0 },
    drains: 2, scuppers: 0,
    assemblyOverride: null, wastePctOverride: null, notes: ''
  }],
  markups: { overheadPct: 10, profitPct: 10, contingencyPct: 5, materialTaxPct: 10 }
};

/* ------------------------------------------------------------------ *
 * Fixture C — Recover, ballasted EPDM (wide sheet), densities all
 * EXPLICITLY 0 (loose-laid — valid, no fastener lines, no errors).
 * No cover board -> expect the recover warning. 2 stories + prevailing
 * wage exercise the labor factors: hf = 1 + (2-1)*5% = 1.05,
 * rate = 100 * 1.5 = 150.
 * ------------------------------------------------------------------ */
var fixtureC = {
  schemaVersion: 1,
  project: { name: 'Fixture C', customer: 'Test Co', address: '', city: '', state: 'NV', estimator: '', bidDate: '', prevailingWage: true, stories: 2, tightAccess: false, craneDays: 0, notes: '' },
  assembly: {
    deckType: 'steel',
    vaporRetarder: null,
    insulationLayers: [{ productKey: 'iso-2' }],
    tapered: null,
    coverBoard: null,
    membraneKey: 'epdm-60',
    attachment: {
      method: 'ballast',
      manufacturerAssemblyRef: 'SAMPLE ballasted assembly ref',
      zoneSplit: { fieldPct: 80, perimPct: 15, cornerPct: 5 },
      insulationDensity: { fieldPerBoard: 0, perimPerBoard: 0, cornerPerBoard: 0 }, // explicit 0 = valid
      membraneDensity: { fieldPerSq: 0, perimPerSq: 0, cornerPerSq: 0 },
      adhesiveKey: null,
      ballastKey: 'bal'
    },
    membraneWastePct: null
  },
  sections: [{
    id: 'c1', name: 'Recover Roof', scope: 'recover',
    existingRoofKey: 'single-ply', existingLayers: 1, existingStackIn: 2,
    allowanceWetInsSqft: 0, allowanceDeckRepairSqft: 0,
    fieldSquares: 80, perimeterLF: 0,
    edgeMetal: { type: 'edge', lf: 0 },
    wallFlash: { lf: 0, avgHeightFt: 0 },
    penetrations: { pipe: 0, curb: 0, skylight: 0, hvac: 0 },
    drains: 0, scuppers: 0,
    assemblyOverride: null, wastePctOverride: null, notes: ''
  }],
  markups: { overheadPct: 10, profitPct: 10, contingencyPct: 0, materialTaxPct: 10 }
};

/* ------------------------------------------------------------------ *
 * Fixture D — Validation. Full assembly (VR + iso + tapered + cover
 * board + TPO-60 mech) but ALL densities left null -> exactly 2 density
 * errors on Roof A with $0 attachment lines; Roof B has zero area ->
 * warning only (no density errors from it). Everything else computes.
 * ------------------------------------------------------------------ */
var fixtureD = {
  schemaVersion: 1,
  project: { name: 'Fixture D', customer: 'Test Co', address: '', city: '', state: 'CA', estimator: '', bidDate: '', prevailingWage: false, stories: 1, tightAccess: false, craneDays: 0, notes: '' },
  assembly: {
    deckType: 'steel',
    vaporRetarder: 'vb',
    insulationLayers: [{ productKey: 'iso-2' }],
    tapered: { avgThicknessIn: 1, designFee: 500 },
    coverBoard: 'cb-05',
    membraneKey: 'tpo-60',
    attachment: {
      method: 'mech',
      manufacturerAssemblyRef: '',
      zoneSplit: { fieldPct: 80, perimPct: 15, cornerPct: 5 },
      insulationDensity: { fieldPerBoard: null, perimPerBoard: null, cornerPerBoard: null }, // null = error
      membraneDensity: { fieldPerSq: null, perimPerSq: null, cornerPerSq: null },            // null = error
      adhesiveKey: null,
      ballastKey: null
    },
    membraneWastePct: null
  },
  sections: [
    {
      id: 'd1', name: 'Roof A', scope: 'new',
      existingRoofKey: null, existingLayers: 1, existingStackIn: 0,
      allowanceWetInsSqft: 0, allowanceDeckRepairSqft: 0,
      fieldSquares: 40, perimeterLF: 0,
      edgeMetal: { type: 'edge', lf: 100 },
      wallFlash: { lf: 50, avgHeightFt: 2 },
      penetrations: { pipe: 3, curb: 0, skylight: 0, hvac: 0 },
      drains: 0, scuppers: 0,
      assemblyOverride: null, wastePctOverride: null, notes: ''
    },
    {
      id: 'd2', name: 'Roof B', scope: 'new',
      existingRoofKey: null, existingLayers: 1, existingStackIn: 0,
      allowanceWetInsSqft: 0, allowanceDeckRepairSqft: 0,
      fieldSquares: 0, perimeterLF: 0,
      edgeMetal: { type: 'edge', lf: 0 },
      wallFlash: { lf: 0, avgHeightFt: 0 },
      penetrations: { pipe: 0, curb: 0, skylight: 0, hvac: 0 },
      drains: 0, scuppers: 0,
      assemblyOverride: null, wastePctOverride: null, notes: ''
    }
  ],
  markups: { overheadPct: 10, profitPct: 10, contingencyPct: 5, materialTaxPct: 10 }
};

if (typeof module !== 'undefined') {
  module.exports = {
    TEST_CATALOG: TEST_CATALOG,
    fixtureA: fixtureA,
    fixtureB: fixtureB,
    fixtureC: fixtureC,
    fixtureD: fixtureD
  };
}
