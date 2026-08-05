/*
 * tests/engine.test.js — plain node script, no test framework.
 * Run: node tests/engine.test.js   (exit code 1 on any failure)
 *
 * All expected values are HAND-DERIVED from the plan's calc rules using
 * TEST_CATALOG's round numbers — derivations are shown in comments.
 */

var engine = require('../js/engine.js');
var fx = require('./fixtures.js');
var defaults = require('../js/catalog.defaults.js');

var passed = 0, failed = 0;

function eq(actual, expected, msg) {
  var ok;
  if (typeof expected === 'number') {
    ok = (typeof actual === 'number') && isFinite(actual) && Math.abs(actual - expected) <= 0.01 + 1e-9;
  } else {
    ok = actual === expected;
  }
  if (ok) { passed++; console.log('  PASS  ' + msg); }
  else { failed++; console.log('  FAIL  ' + msg + '   (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')'); }
}
function ok(cond, msg) { eq(!!cond, true, msg); }

function line(res, pred) { return res.lines.filter(pred)[0]; }
function orderItem(res, sku) { return res.orderList.filter(function (o) { return o.sku === sku; })[0]; }

/* ==================================================================== *
 * FIXTURE A — new construction, TPO-60 mech, 100 sq (10,000 sqft)
 *
 * hf = 1 (1 story, no tight access); rate = $100/hr (no prevailing).
 * Zones (80/15/5): field 8000, perim 1500, corner 500 sqft.
 *
 * MEMBRANE (tpo-60: 10x100 roll = 1000 sqft, $100/sq -> $1000/roll, 10% waste):
 *   fieldGross = 10000 * 1.10                    = 11000 sqft
 *   flashGross = 200 LF * (1.5 + 0.5 lap) * 1.10 =   440 sqft
 *   rolls = ceil(11440/1000) = 12  ->  total mat = 12 * $1000 = $12000
 *   field line = 12000 * 11000/11440 = 11538.4615 -> $11538.46
 *   flash line = 12000 - 11538.46               ->   $461.54  (exact complement)
 *   field hrs = 100 sq * 1.0 (mech) = 100 -> $10000
 *   flash hrs = 200 LF * 0.1        =  20 -> $2000
 *
 * INSULATION (iso-2, 0% waste): boards = ceil(10000/32) = ceil(312.5) = 313
 *   mat = 313 * $32 = $10016; hrs = 100 * 0.3 = 30 -> $3000
 *
 * INSULATION FASTENING (top layer iso-2; densities 5/8/12 per board):
 *   boards/zone = 8000/32 = 250, 1500/32 = 46.875, 500/32 = 15.625
 *   screws = 250*5 + 46.875*8 + 15.625*12 = 1250 + 375 + 187.5 = 1812.5 -> 1813
 *   length: stack 2" + steel embed 1" = 3" -> cheapest >= 3" is f-4 ($0.20)
 *   screws mat = 1813 * 0.20 = $362.60; plates p-ins = 1813 * 0.10 = $181.30
 *
 * MEMBRANE FASTENING (densities 10/15/20 per square):
 *   count = 80*10 + 15*15 + 5*20 = 800 + 225 + 100 = 1125
 *   f-4: 1125 * 0.20 = $225.00; seam plates p-seam: 1125 * 0.10 = $112.50
 *
 * EDGE METAL: 400 LF * $10 = $4000; hrs = 400*0.1 = 40 -> $4000
 * DETAILS: pipe 10*$50=$500 (10 hrs), curb 2*$200=$400 (4 hrs),
 *          drain 4*$400=$1600 (8 hrs)
 * EQUIPMENT: mobilization $1000 (craneDays 0)
 *
 * TOTALS:
 *   matCost = 12000 + 10016 + 362.60 + 181.30 + 225 + 112.50 + 4000
 *           + (500+400+1600) = $29397.40   (all taxable)
 *   laborHours = 100+20+30+40+(10+4+8) = 212 -> laborCost $21200
 *   direct = 29397.40 + 21200 + 1000 = $51597.40
 *   overhead 10%   = $5159.74                       -> 56757.14
 *   profit 10%     = r2(56757.14*0.10) = $5675.71   -> 62432.85
 *   contingency 0% = $0
 *   materialTax    = r2(29397.40*0.10) = $2939.74
 *   grand = 51597.40+5159.74+5675.71+0+2939.74 = $65372.59
 *   perSqFt = 65372.59/10000 = $6.54
 *
 * ORDER LIST (raw sums first, THEN ceil):
 *   tpo-60: 11440 sqft -> 12 rolls
 *   iso-2:  312.5 -> 313 boards
 *   f-4:    1812.5 + 1125 = 2937.5 -> 2938 screws -> ceil(2938/1000) = 3 boxes
 *   p-ins:  1812.5 -> 1813 -> 2 boxes;  p-seam: 1125 -> 2 boxes
 * ==================================================================== */

console.log('--- Fixture A: new construction, TPO-60 mech, 100 sq ---');
var A = engine.computeEstimate(fx.fixtureA, fx.TEST_CATALOG);

eq(A.errors.length, 0, 'A: no errors');
eq(A.warnings.length, 0, 'A: no warnings');

var aField = line(A, function (l) { return l.category === 'membrane' && l.sku === 'tpo-60'; });
var aFlash = line(A, function (l) { return l.category === 'flashings' && l.sku === 'tpo-60-flash'; });
ok(aField && aFlash, 'A: membrane field + flashing lines exist');
eq(aField.qty, 12, 'A: 12 rolls purchased');
eq(aField.unitMat, 1000, 'A: roll cost $1000');
eq(aField.matTotal, 11538.46, 'A: field membrane mat $11538.46');
eq(aFlash.matTotal, 461.54, 'A: flashing membrane mat $461.54');
eq(aField.matTotal + aFlash.matTotal, aField.qty * aField.unitMat, 'A: INVARIANT field+flash = rolls x roll cost ($12000)');
eq(aField.hrs, 100, 'A: field membrane 100 hrs');
eq(aField.laborTotal, 10000, 'A: field membrane labor $10000');
eq(aFlash.hrs, 20, 'A: flashing 20 hrs');
eq(aFlash.laborTotal, 2000, 'A: flashing labor $2000');
ok(!line(A, function (l) { return /seamtape/.test(l.sku); }), 'A: no seam tape line (welded TPO)');

var aIns = line(A, function (l) { return l.category === 'insulation' && l.sku === 'iso-2'; });
eq(aIns.qty, 313, 'A: 313 insulation boards (ceil 312.5)');
eq(aIns.matTotal, 10016, 'A: insulation mat $10016');
eq(aIns.hrs, 30, 'A: insulation 30 hrs');

var aInsScrews = line(A, function (l) { return l.category === 'attachment' && /Insulation fastening — screws/.test(l.desc); });
var aInsPlates = line(A, function (l) { return l.category === 'attachment' && /Insulation fastening — plates/.test(l.desc); });
eq(aInsScrews.sku, 'f-4', 'A: auto-picked f-4 (cheapest >= 3")');
eq(aInsScrews.qty, 1813, 'A: 1813 insulation screws (ceil 1812.5)');
eq(aInsScrews.matTotal, 362.60, 'A: insulation screws $362.60');
eq(aInsPlates.sku, 'p-ins', 'A: insulation plates p-ins');
eq(aInsPlates.qty, 1813, 'A: 1813 insulation plates');
eq(aInsPlates.matTotal, 181.30, 'A: insulation plates $181.30');

var aMemScrews = line(A, function (l) { return l.category === 'attachment' && /Membrane fastening — screws/.test(l.desc); });
var aMemPlates = line(A, function (l) { return l.category === 'attachment' && /seam plates/.test(l.desc); });
eq(aMemScrews.sku, 'f-4', 'A: membrane screws also f-4');
eq(aMemScrews.qty, 1125, 'A: 1125 membrane screws (800+225+100)');
eq(aMemScrews.matTotal, 225, 'A: membrane screws $225.00');
eq(aMemPlates.qty, 1125, 'A: 1125 seam plates');
eq(aMemPlates.matTotal, 112.50, 'A: seam plates $112.50');

var aEdge = line(A, function (l) { return l.category === 'sheetmetal'; });
eq(aEdge.matTotal, 4000, 'A: edge metal $4000');
eq(aEdge.hrs, 40, 'A: edge metal 40 hrs');

eq(line(A, function (l) { return l.sku === 'det-pipe'; }).matTotal, 500, 'A: pipes $500');
eq(line(A, function (l) { return l.sku === 'det-curb'; }).matTotal, 400, 'A: curbs $400');
eq(line(A, function (l) { return l.sku === 'det-drain'; }).matTotal, 1600, 'A: drains $1600');
eq(line(A, function (l) { return l.sku === 'mobilization'; }).matTotal, 1000, 'A: mobilization $1000');

eq(A.totals.matCost, 29397.40, 'A: matCost $29397.40');
eq(A.totals.laborHours, 212, 'A: 212 labor hours');
eq(A.totals.laborCost, 21200, 'A: laborCost $21200');
eq(A.totals.equipCost, 1000, 'A: equipCost $1000');
eq(A.totals.disposalCost, 0, 'A: disposalCost $0');
eq(A.totals.allowanceCost, 0, 'A: allowanceCost $0');
eq(A.totals.directCost, 51597.40, 'A: directCost $51597.40');
eq(A.totals.overhead, 5159.74, 'A: overhead $5159.74');
eq(A.totals.profit, 5675.71, 'A: profit $5675.71');
eq(A.totals.contingency, 0, 'A: contingency $0');
eq(A.totals.materialTax, 2939.74, 'A: materialTax $2939.74');
eq(A.totals.grandTotal, 65372.59, 'A: grandTotal $65372.59');
eq(A.totals.perSqFt, 6.54, 'A: $6.54 per sqft');
eq(A.totals.totalSquares, 100, 'A: 100 squares');

eq(orderItem(A, 'tpo-60').qty, 12, 'A order: 12 rolls tpo-60');
eq(orderItem(A, 'tpo-60').unit, 'roll', 'A order: tpo-60 unit roll');
eq(orderItem(A, 'iso-2').qty, 313, 'A order: 313 boards iso-2');
eq(orderItem(A, 'f-4').qty, 3, 'A order: 3 boxes f-4 (2937.5 raw -> 2938 -> 3 boxes of 1000)');
eq(orderItem(A, 'f-4').unit, 'box', 'A order: f-4 unit box');
eq(orderItem(A, 'p-ins').qty, 2, 'A order: 2 boxes p-ins (1813 -> 2 boxes)');
eq(orderItem(A, 'p-seam').qty, 2, 'A order: 2 boxes p-seam (1125 -> 2 boxes)');
eq(orderItem(A, 'metal-edge').qty, 400, 'A order: 400 LF edge metal');

/* ==================================================================== *
 * FIXTURE B — tear-off 2-layer BUR -> TPO-60 fully adhered, 50 sq,
 * 5% contingency, 1 crane day, 200 sqft wet-ins allowance.
 *
 * hf = 1; rate = $100/hr.
 * area = 5000 sqft; zones 4000/750/250.
 *
 * TEAR-OFF (bur: 5 lbs/sqft, 1.0 hr/sq per layer, 2 layers):
 *   demo hrs = 50 * 2 * 1.0 = 100 -> $10000
 *   tons = 5000 * 5 * 2 / 2000 = 25
 * DISPOSAL (estimate-wide): pulls = ceil(25/10) = 3
 *   disposal = 3*$500 + 25*$100 = $4000 (non-taxable)
 *
 * MEMBRANE: fieldGross = 5000*1.1 = 5500; flashGross = 100*(2+0.5)*1.1 = 275
 *   rolls = ceil(5775/1000) = 6 -> $6000
 *   field = r2(6000*5500/5775) = $5714.29; flash = $285.71
 *   field hrs = 50*1.5 (adhered) = 75 -> $7500; flash hrs = 100*0.1 = 10 -> $1000
 *
 * ADHESIVE: gal = (5000 field + 100*2 wall-flash finished)/50 = 104
 *   pails = ceil(104/5) = 21 -> 21*$250 = $5250
 *
 * INSULATION iso-2: ceil(5000/32) = 157 boards -> $5024; 15 hrs -> $1500
 * COVER BOARD cb-05: 157 boards -> $5024; 10 hrs -> $1000
 *
 * INSULATION FASTENING (top layer = cover board; densities 5/8/12):
 *   boards/zone = 4000/32=125, 750/32=23.4375, 250/32=7.8125
 *   screws = 125*5 + 23.4375*8 + 7.8125*12 = 625+187.5+93.75 = 906.25 -> 907
 *   length: stack 2 + 0.5 + embed 1 = 3.5" -> f-4 (4")
 *   screws = 907*0.20 = $181.40; plates = 907*0.10 = $90.70
 *   (no membrane fastening — adhered; null membrane densities must NOT error)
 *
 * DETAILS: 2 drains = $800 mat, 4 hrs -> $400
 * ALLOWANCE: 200 sqft * $5 = $1000 (non-taxable)
 * EQUIPMENT: crane 1*$2000 + mobilization $1000 = $3000
 *
 * TOTALS:
 *   matCost = 6000 + 5250 + 5024 + 5024 + 181.40 + 90.70 + 800 = $22370.10
 *   laborHours = 100+75+10+15+10+4 = 214 -> $21400
 *   direct = 22370.10+21400+3000+4000+1000 = $51770.10
 *   overhead = $5177.01                       -> 56947.11
 *   profit = r2(56947.11*0.10) = $5694.71     -> 62641.82
 *   contingency = r2(62641.82*0.05) = $3132.09
 *   materialTax = r2(22370.10*0.10) = $2237.01
 *   grand = 51770.10+5177.01+5694.71+3132.09+2237.01 = $68010.92
 *   perSqFt = 68010.92/5000 = $13.60
 * ==================================================================== */

console.log('--- Fixture B: tear-off BUR -> TPO-60 adhered, 50 sq ---');
var B = engine.computeEstimate(fx.fixtureB, fx.TEST_CATALOG);

eq(B.errors.length, 0, 'B: no errors (null membrane densities are fine when adhered)');

var bDemo = line(B, function (l) { return l.category === 'demo' && l.sku !== 'disposal'; });
eq(bDemo.hrs, 100, 'B: tear-off 100 hrs (50 sq x 2 layers x 1.0)');
eq(bDemo.laborTotal, 10000, 'B: tear-off labor $10000');

var bDisp = line(B, function (l) { return l.sku === 'disposal'; });
eq(bDisp.qty, 25, 'B: 25 tons of debris');
eq(bDisp.matTotal, 4000, 'B: disposal $4000 (3 pulls x $500 + 25 t x $100)');
ok(/3 dumpster pull/.test(bDisp.desc), 'B: 3 dumpster pulls (estimate-wide ceil 25/10)');
eq(bDisp.taxable, false, 'B: disposal non-taxable');
eq(B.totals.disposalCost, 4000, 'B: totals.disposalCost $4000');

var bField = line(B, function (l) { return l.category === 'membrane' && l.sku === 'tpo-60'; });
var bFlash = line(B, function (l) { return l.category === 'flashings'; });
eq(bField.qty, 6, 'B: 6 rolls (ceil 5775/1000)');
eq(bField.matTotal, 5714.29, 'B: field membrane $5714.29');
eq(bFlash.matTotal, 285.71, 'B: flashing membrane $285.71');
eq(bField.matTotal + bFlash.matTotal, bField.qty * bField.unitMat, 'B: INVARIANT field+flash = rolls x roll cost ($6000)');
eq(bField.hrs, 75, 'B: adhered membrane 75 hrs (50 x 1.5)');

var bAdh = line(B, function (l) { return l.sku === 'adh'; });
eq(bAdh.qty, 21, 'B: 21 pails (ceil 104 gal / 5)');
eq(bAdh.matTotal, 5250, 'B: adhesive $5250');
ok(/104 gal/.test(bAdh.desc), 'B: 104 gal incl. wall-flashing gallons');

var bInsScrews = line(B, function (l) { return l.category === 'attachment' && /Insulation fastening — screws/.test(l.desc); });
eq(bInsScrews.sku, 'f-4', 'B: f-4 auto-picked (stack 3.5" incl. cover board)');
eq(bInsScrews.qty, 907, 'B: 907 insulation screws (ceil 906.25, cover-board pass)');
eq(bInsScrews.matTotal, 181.40, 'B: insulation screws $181.40');
eq(line(B, function (l) { return l.sku === 'p-ins'; }).matTotal, 90.70, 'B: insulation plates $90.70');
ok(!line(B, function (l) { return /Membrane fastening/.test(l.desc); }), 'B: no membrane fastening lines (adhered)');

var bAllow = line(B, function (l) { return l.category === 'allowance'; });
eq(bAllow.matTotal, 1000, 'B: wet-ins allowance $1000');
ok(/^ALLOWANCE — unit-priced/.test(bAllow.desc), 'B: allowance labeled "ALLOWANCE — unit-priced"');
eq(B.totals.allowanceCost, 1000, 'B: totals.allowanceCost $1000');

eq(line(B, function (l) { return l.sku === 'crane'; }).matTotal, 2000, 'B: crane $2000');
eq(B.totals.equipCost, 3000, 'B: equipCost $3000 (crane + mobilization)');

eq(B.totals.matCost, 22370.10, 'B: matCost $22370.10');
eq(B.totals.laborHours, 214, 'B: 214 labor hours');
eq(B.totals.laborCost, 21400, 'B: laborCost $21400');
eq(B.totals.directCost, 51770.10, 'B: directCost $51770.10');
eq(B.totals.overhead, 5177.01, 'B: overhead $5177.01');
eq(B.totals.profit, 5694.71, 'B: profit $5694.71');
eq(B.totals.contingency, 3132.09, 'B: contingency $3132.09 (5% after OH+profit)');
eq(B.totals.materialTax, 2237.01, 'B: materialTax $2237.01');
eq(B.totals.grandTotal, 68010.92, 'B: grandTotal $68010.92');
eq(B.totals.perSqFt, 13.60, 'B: $13.60 per sqft');

eq(orderItem(B, 'adh').qty, 21, 'B order: 21 pails');
eq(orderItem(B, 'f-4').qty, 1, 'B order: 1 box f-4 (907 of 1000)');
eq(orderItem(B, 'tpo-60').qty, 6, 'B order: 6 rolls');

/* ==================================================================== *
 * FIXTURE C — recover, ballasted EPDM wide sheet, densities all 0.
 *
 * hf = 1 + (2-1)*5% = 1.05; rate = 100*1.5 = $150 (prevailing wage).
 * area = 8000 sqft (80 sq).
 *
 * MEMBRANE epdm-60 (20x100 = 2000 sqft/roll, $2000/roll, 10% waste):
 *   fieldGross = 8000*1.1 = 8800; no wall flash
 *   rolls = ceil(8800/2000) = ceil(4.4) = 5 -> field line $10000 (all of it)
 * SEAM TAPE (EPDM): mat = 80 sq * $10 = $800
 *   hrs = 80*0.2*1.05 = 16.8 -> labor = 16.8*$150 = $2520
 * BALLAST: tons = 8000*10/2000 = 40 exactly — NOT rounded up
 *   mat = 40*$50 = $2000; spread hrs = 80*0.5*1.05 = 42 -> $6300
 * INSULATION: 8000/32 = 250 boards -> $8000
 * FASTENING: all densities explicitly 0 -> screws = 0 -> NO fastener/plate
 *   lines and NO errors. Recover without cover board -> exactly 1 warning.
 * ==================================================================== */

console.log('--- Fixture C: recover, ballasted EPDM, densities = 0 ---');
var C = engine.computeEstimate(fx.fixtureC, fx.TEST_CATALOG);

eq(C.errors.length, 0, 'C: zero errors (explicit 0 densities are valid)');
eq(C.warnings.length, 1, 'C: exactly one warning');
ok(/cover board/i.test(C.warnings[0].msg), 'C: warning is recover-without-cover-board');

var cTape = line(C, function (l) { return l.sku === 'epdm-60-seamtape'; });
ok(cTape, 'C: EPDM seam tape line exists');
eq(cTape.qty, 80, 'C: seam tape 80 sq');
eq(cTape.matTotal, 800, 'C: seam tape mat $800');
eq(cTape.hrs, 16.8, 'C: seam tape 16.8 hrs (80*0.2*1.05 height factor)');
eq(cTape.laborTotal, 2520, 'C: seam tape labor $2520 (16.8 x $150 prevailing)');

var cBal = line(C, function (l) { return l.sku === 'bal'; });
eq(cBal.qty, 40, 'C: ballast 40 tons, unrounded');
eq(cBal.matTotal, 2000, 'C: ballast $2000');
eq(cBal.hrs, 42, 'C: ballast spreading 42 hrs (80*0.5*1.05)');
eq(orderItem(C, 'bal').qty, 40, 'C order: 40 tons (no ceil)');
eq(orderItem(C, 'bal').unit, 'ton', 'C order: ballast unit ton');

var cFieldMem = line(C, function (l) { return l.category === 'membrane' && l.sku === 'epdm-60'; });
eq(cFieldMem.qty, 5, 'C: 5 rolls (ceil 8800/2000, wide EPDM)');
eq(cFieldMem.matTotal, 10000, 'C: field membrane $10000 (no flashing split)');
eq(line(C, function (l) { return l.sku === 'iso-2'; }).qty, 250, 'C: 250 insulation boards');

var cFastLines = C.lines.filter(function (l) {
  return /^(f-|p-)/.test(l.sku) || /fastening/i.test(l.desc);
});
eq(cFastLines.length, 0, 'C: zero fastener/plate lines (loose-laid, densities 0)');
eq(C.lines.filter(function (l) { return l.category === 'attachment'; }).length, 1, 'C: only attachment line is the ballast');

/* ==================================================================== *
 * FIXTURE D — validation: null densities + zero-area section.
 *
 * Roof A (40 sq) needs insulation AND membrane densities (mech, boards
 * exist) -> exactly 2 errors, each producing a $0 attachment line.
 * Roof B (0 sq) -> zero-area warning only, and must NOT add density
 * errors of its own. Everything else (VR, iso, tapered + $500 design
 * fee, cover board, membrane, edge, pipes) computes normally.
 * ==================================================================== */

console.log('--- Fixture D: validation (null densities, zero-area section) ---');
var D = engine.computeEstimate(fx.fixtureD, fx.TEST_CATALOG);

eq(D.errors.length, 2, 'D: exactly 2 errors');
eq(D.errors.filter(function (e) { return /insulationDensity/.test(e.path || ''); }).length, 1, 'D: one insulation-density error');
eq(D.errors.filter(function (e) { return /membraneDensity/.test(e.path || ''); }).length, 1, 'D: one membrane-density error');
ok(D.errors.every(function (e) { return e.sectionId === 'd1'; }), 'D: both errors point at Roof A (zero-area Roof B adds none)');

var dAtt = D.lines.filter(function (l) { return l.category === 'attachment'; });
eq(dAtt.length, 2, 'D: 2 placeholder attachment lines');
ok(dAtt.every(function (l) { return l.matTotal === 0 && l.laborTotal === 0 && l.qty === 0; }), 'D: attachment lines compute $0');

eq(D.warnings.length, 1, 'D: exactly one warning');
ok(/zero roof area/i.test(D.warnings[0].msg), 'D: warning is the zero-area section');
eq(D.warnings[0].sectionId, 'd2', 'D: zero-area warning points at Roof B');

ok(JSON.stringify(D).indexOf('NaN') === -1, 'D: no NaN anywhere in serialized result');

// The rest still computes: VR (40 sq * $50 = 2000), tapered (4000 sqft *
// 1" * $1 = 4000 + $500 fee), cover board + iso (ceil(4000/32) = 125 each),
// membrane, edge metal (100 LF * $10), 3 pipes.
eq(line(D, function (l) { return l.sku === 'vb'; }).matTotal, 2000, 'D: vapor retarder $2000');
eq(line(D, function (l) { return l.sku === 'iso-tapered'; }).matTotal, 4000, 'D: tapered adder $4000 (4000 sqft x 1" x $1)');
var dFee = line(D, function (l) { return l.sku === 'tapered-design'; });
eq(dFee.matTotal, 500, 'D: tapered design fee $500');
eq(dFee.taxable, false, 'D: design fee non-taxable');
eq(dFee.sectionId, null, 'D: design fee is estimate-wide');
eq(line(D, function (l) { return l.sku === 'iso-2'; }).qty, 125, 'D: 125 iso boards (4000/32)');
eq(line(D, function (l) { return l.sku === 'cb-05'; }).qty, 125, 'D: 125 cover boards');
eq(line(D, function (l) { return l.sku === 'metal-edge'; }).matTotal, 1000, 'D: edge metal $1000');
eq(line(D, function (l) { return l.sku === 'det-pipe'; }).qty, 3, 'D: 3 pipes');
ok(D.totals.grandTotal > 0, 'D: grand total > 0 — rest of the estimate still prices');

// Membrane invariant again, on D's numbers:
//   fieldGross = 4000*1.1 = 4400; flashGross = 50*(2+0.5)*1.1 = 137.5
//   rolls = ceil(4537.5/1000) = 5 -> $5000 split 4848.48 / 151.52
var dField = line(D, function (l) { return l.category === 'membrane' && l.sku === 'tpo-60'; });
var dFlash = line(D, function (l) { return l.category === 'flashings'; });
eq(dField.qty, 5, 'D: 5 rolls');
eq(dField.matTotal, 4848.48, 'D: field membrane $4848.48');
eq(dFlash.matTotal, 151.52, 'D: flashing membrane $151.52');
eq(dField.matTotal + dFlash.matTotal, dField.qty * dField.unitMat, 'D: INVARIANT field+flash = rolls x roll cost ($5000)');

// grandTotal must equal the recomputed sum of its parts (same bucketing
// rules: demo mat$ -> disposal, equipment mat$ -> equip, allowance mat$ ->
// allowance, all other mat$ -> materials; all labor -> labor).
var mat = 0, laborC = 0, equip = 0, disp = 0, allow = 0, taxable = 0;
D.lines.forEach(function (l) {
  laborC += l.laborTotal;
  if (l.category === 'equipment') equip += l.matTotal;
  else if (l.category === 'allowance') allow += l.matTotal;
  else if (l.category === 'demo') disp += l.matTotal;
  else mat += l.matTotal;
  if (l.taxable) taxable += l.matTotal;
});
var direct = mat + laborC + equip + disp + allow;
eq(D.totals.directCost, direct, 'D: directCost = sum of line buckets');
eq(D.totals.overhead, Math.round(direct * 0.10 * 100) / 100, 'D: overhead = 10% of direct');
eq(D.totals.profit, Math.round((direct + D.totals.overhead) * 0.10 * 100) / 100, 'D: profit = 10% after OH');
eq(D.totals.contingency, Math.round((direct + D.totals.overhead + D.totals.profit) * 0.05 * 100) / 100, 'D: contingency = 5% after profit');
eq(D.totals.materialTax, Math.round(taxable * 0.10 * 100) / 100, 'D: materialTax = 10% of taxable mat only');
eq(D.totals.grandTotal, direct + D.totals.overhead + D.totals.profit + D.totals.contingency + D.totals.materialTax,
  'D: grandTotal = direct + OH + profit + contingency + tax');

/* ==================================================================== *
 * newEstimate factory + default-catalog smoke test
 * ==================================================================== */

console.log('--- newEstimate factory + default catalog smoke ---');
var blank = engine.newEstimate(fx.TEST_CATALOG);
eq(blank.schemaVersion, 1, 'new: schemaVersion 1');
eq(blank.sections.length, 1, 'new: one section');
eq(blank.sections[0].name, 'Main Roof', 'new: section named "Main Roof"');
ok(!!blank.sections[0].id, 'new: section has a stable id');
eq(blank.markups.overheadPct, 10, 'new: markups seeded from catalog defaults');
eq(blank.markups.materialTaxPct, 10, 'new: tax seeded from catalog defaults');
eq(blank.assembly.attachment.zoneSplit.fieldPct, 80, 'new: zone split seeded from catalog defaults');
eq(blank.assembly.attachment.insulationDensity.fieldPerBoard, null, 'new: insulation densities start null (no defaults)');
eq(blank.assembly.attachment.membraneDensity.fieldPerSq, null, 'new: membrane densities start null (no defaults)');
var blankRes = engine.computeEstimate(blank, fx.TEST_CATALOG);
eq(blankRes.errors.length, 0, 'new: blank estimate computes with no errors');
eq(blankRes.totals.grandTotal, 0, 'new: blank estimate totals $0');
ok(JSON.stringify(blankRes).indexOf('NaN') === -1, 'new: no NaN in blank result');

// Smoke: KRE_DEFAULT_CATALOG keys line up with what the engine reads.
ok(!JSON.stringify(defaults.KRE_DEFAULT_CATALOG).match(/density/i), 'defaults: catalog contains NO fastening densities');
eq(defaults.KRE_DEFAULT_CATALOG.meta.schemaVersion, 1, 'defaults: meta.schemaVersion 1');
eq(defaults.KRE_DEFAULT_CATALOG.meta.customized, false, 'defaults: meta.customized false');
ok(Array.isArray(defaults.KRE_CATALOG_SCHEMA) && defaults.KRE_CATALOG_SCHEMA.length > 0, 'defaults: schema is a non-empty array');
var smoke = engine.newEstimate(defaults.KRE_DEFAULT_CATALOG);
smoke.assembly.membraneKey = 'tpo-60';
smoke.assembly.insulationLayers = [{ productKey: 'iso-15' }];
smoke.assembly.coverBoard = 'hd-iso-05';
smoke.assembly.attachment.insulationDensity = { fieldPerBoard: 4, perimPerBoard: 6, cornerPerBoard: 8 };
smoke.assembly.attachment.membraneDensity = { fieldPerSq: 5, perimPerSq: 8, cornerPerSq: 10 };
smoke.sections[0].fieldSquares = 10;
smoke.sections[0].wallFlash = { lf: 40, avgHeightFt: 2 };
smoke.sections[0].drains = 1;
var S = engine.computeEstimate(smoke, defaults.KRE_DEFAULT_CATALOG);
eq(S.errors.length, 0, 'defaults smoke: computes with no errors');
ok(S.totals.grandTotal > 0, 'defaults smoke: grand total > 0');
ok(JSON.stringify(S).indexOf('NaN') === -1, 'defaults smoke: no NaN');
eq(smoke.markups.materialTaxPct, 8.25, 'defaults smoke: markups seeded from default catalog');

/* ==================================================================== */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
