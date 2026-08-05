/* Tests for equipment interchangeability (crane/forklift) and per-section
   system-template overrides. Run: node tests/features.test.js */
'use strict';

var engine = require('../js/engine.js');
var defaults = require('../js/catalog.defaults.js');
var C = defaults.KRE_DEFAULT_CATALOG;

var failed = 0;
function ok(cond, msg) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + msg);
  if (!cond) failed++;
}
function eq(a, b, msg) { ok(Math.abs(a - b) < 0.01, msg + ' (got ' + a + ', want ' + b + ')'); }

function baseEstimate() {
  var est = engine.newEstimate(C);
  est.assembly.membraneKey = 'tpo-60';
  est.assembly.insulationLayers = [{ productKey: 'iso-26' }];
  est.assembly.attachment.insulationDensity = { fieldPerBoard: 8, perimPerBoard: 12, cornerPerBoard: 16 };
  est.assembly.attachment.membraneDensity = { fieldPerSq: 20, perimPerSq: 40, cornerPerSq: 60 };
  est.sections[0].fieldSquares = 100;
  return est;
}
function equipLines(res) {
  return res.lines.filter(function (l) { return l.category === 'equipment' && l.sku !== 'mobilization'; });
}

/* --- equipment type is interchangeable --- */
var est = baseEstimate();
est.project.craneDays = 3;

est.project.equipmentType = 'crane';
var crane = equipLines(engine.computeEstimate(est, C));
ok(crane.length === 1 && /Crane/.test(crane[0].desc), 'crane: one line, labeled Crane');
eq(crane[0].matTotal, 3 * C.equipment.craneDay, 'crane: 3 days at craneDay rate');

est.project.equipmentType = 'forklift';
var fork = equipLines(engine.computeEstimate(est, C));
ok(fork.length === 1 && /Forklift/.test(fork[0].desc), 'forklift: one line, labeled Forklift');
eq(fork[0].matTotal, 3 * C.equipment.forkliftDay, 'forklift: 3 days at forkliftDay rate');
ok(fork[0].matTotal !== crane[0].matTotal, 'crane and forklift rates actually differ');

est.project.equipmentType = 'none';
ok(equipLines(engine.computeEstimate(est, C)).length === 0, 'none: no hoisting line even with days > 0');

delete est.project.equipmentType; // old saved drafts have no equipmentType
var legacy = equipLines(engine.computeEstimate(est, C));
ok(legacy.length === 1 && /Crane/.test(legacy[0].desc), 'back-compat: missing equipmentType defaults to crane');

/* --- default templates reference real catalog keys --- */
Object.keys(C.systemTemplates).forEach(function (k) {
  var t = C.systemTemplates[k];
  var a = t.assembly;
  ok(!!C.membranes[a.membraneKey], 'template ' + k + ': membraneKey exists in catalog');
  (a.insulationLayers || []).forEach(function (l) {
    ok(!!C.insulations[l.productKey], 'template ' + k + ': insulation ' + l.productKey + ' exists');
  });
  if (a.coverBoard) ok(!!C.coverBoards[a.coverBoard], 'template ' + k + ': cover board exists');
  if (a.attachment.adhesiveKey) ok(!!C.adhesives[a.attachment.adhesiveKey], 'template ' + k + ': adhesive exists');
  if (a.attachment.ballastKey) ok(!!C.ballasts[a.attachment.ballastKey], 'template ' + k + ': ballast exists');
});

/* --- per-section template override changes that section's system --- */
var est2 = baseEstimate();
est2.project.equipmentType = 'none';
est2.sections[0].name = 'MA Section';
// second section assigned the ballasted EPDM template via assemblyOverride
var s2 = JSON.parse(JSON.stringify(est2.sections[0]));
s2.id = 's-ball'; s2.name = 'Ballast Section';
s2.templateKey = 'epdm60-ballast';
s2.assemblyOverride = JSON.parse(JSON.stringify(C.systemTemplates['epdm60-ballast'].assembly));
est2.sections.push(s2);

var res2 = engine.computeEstimate(est2, C);
ok(res2.errors.length === 0, 'mixed-template estimate computes with no errors (' +
  res2.errors.map(function (e) { return e.msg; }).join('; ') + ')');
var maLines = res2.sections[0].lines, ballLines = res2.sections[1].lines;
ok(maLines.some(function (l) { return /TPO 60/.test(l.desc) && l.category === 'membrane'; }),
  'section 1 uses the estimate TPO assembly');
ok(ballLines.some(function (l) { return /EPDM/.test(l.desc) && l.category === 'membrane'; }),
  'section 2 membrane comes from the template (EPDM)');
ok(ballLines.some(function (l) { return l.category === 'attachment' && /ballast/i.test(l.desc); }),
  'section 2 has a ballast attachment line');
ok(!ballLines.some(function (l) { return /fastener/i.test(l.desc) && l.matTotal > 0; }),
  'section 2 (loose-laid, densities 0) has no paid fastener lines');
ok(maLines.some(function (l) { return l.category === 'attachment' && l.matTotal > 0; }),
  'section 1 (mech) still has paid attachment lines');

console.log('');
console.log(failed ? failed + ' FAILED' : 'ALL FEATURE TESTS PASSED');
process.exitCode = failed ? 1 : 0;
