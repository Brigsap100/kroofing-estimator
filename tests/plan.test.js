/* Tests for js/plan.js — rectangle solver, projection math, and the SVG
   builder. Run: node tests/plan.test.js */
'use strict';

var plan = require('../js/plan.js');
var engine = require('../js/engine.js');
var C = require('../js/catalog.defaults.js').KRE_DEFAULT_CATALOG;

var failed = 0;
function ok(cond, msg) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + msg);
  if (!cond) failed++;
}
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ~' + b + ')'); }

/* --- rectDims: solve l×w from area + perimeter --- */
var d = plan.rectDims(12000, 460); // l+w=230, l*w=12000 → 150×80
near(d.l, 150, 0.01, 'rectDims: length from area+perimeter');
near(d.w, 80, 0.01, 'rectDims: width from area+perimeter');
near(d.l * d.w, 12000, 0.5, 'rectDims: area preserved');

d = plan.rectDims(10000, 100); // perimeter too short → square fallback
near(d.l, 100, 0.01, 'rectDims: impossible perimeter → square');
near(d.w, 100, 0.01, 'rectDims: impossible perimeter → square width');

d = plan.rectDims(10000, 2200); // extreme perimeter → aspect capped at 8:1
ok(d.l / d.w <= 8.01, 'rectDims: aspect ratio capped (got ' + (d.l / d.w).toFixed(1) + ':1)');
near(d.l * d.w, 10000, 1, 'rectDims: capped rect keeps area');

d = plan.rectDims(0, 0);
ok(d.l > 0 && d.w > 0, 'rectDims: zero inputs stay positive');

/* --- projection --- */
var top = plan.makeProj(0, 0); // straight-down bird's eye
var p = top(10, 20, 99);
near(p.x, 10, 1e-9, 'proj tilt=0: x passes through');
near(p.y, 20, 1e-9, 'proj tilt=0: y is plan position (height invisible)');
ok(top(0, 0, 5).d > top(0, 0, 1).d, 'proj tilt=0: higher z is closer to camera');

var yaw90 = plan.makeProj(90, 0);
p = yaw90(10, 0, 0);
near(p.x, 10 * Math.cos(Math.PI / 2), 1e-9, 'proj yaw=90: x rotates');
near(p.y, 10, 1e-9, 'proj yaw=90: x-axis maps to screen y');

var tilted = plan.makeProj(0, 60);
ok(Math.abs(tilted(0, 10, 0).y) < 10, 'proj tilt: depth foreshortens');
ok(tilted(0, 0, 10).y < 0, 'proj tilt: height rises on screen (negative y)');

/* --- SVG builder --- */
var est = engine.newEstimate(C);
est.assembly.membraneKey = 'epdm-60';
est.sections[0].name = 'Main Roof';
est.sections[0].fieldSquares = 120;
est.sections[0].perimeterLF = 460;
est.sections[0].wallFlash = { lf: 300, avgHeightFt: 2 };
est.sections[0].edgeMetal = { type: 'coping', lf: 460 };
est.sections[0].penetrations = { pipe: 12, curb: 0, skylight: 1, hvac: 3 };
est.sections[0].drains = 4;
var s2 = JSON.parse(JSON.stringify(est.sections[0]));
s2.id = 's2'; s2.name = 'Penthouse'; s2.fieldSquares = 15; s2.perimeterLF = 160;
est.sections.push(s2);

var svg = plan.build(est, C, null, { yaw: 25, tilt: 40 });
ok(/^<svg viewBox="/.test(svg), 'build: returns an <svg> with a viewBox');
ok(svg.indexOf('NaN') === -1, 'build: no NaN anywhere');
ok(svg.indexOf('Main Roof') >= 0 && svg.indexOf('Penthouse') >= 0, 'build: both section labels present');
ok(svg.indexOf('data-pvsec="' + est.sections[0].id + '"') >= 0, 'build: faces carry their section id');
ok(svg.indexOf('HVAC units × 3') >= 0, 'build: HVAC hover label with true count');
ok(svg.indexOf('Pipe penetrations × 12 (6 drawn)') >= 0, 'build: capped icons state the real count');
ok(svg.indexOf('parapet') >= 0, 'build: parapet faces present when flashing exists');
ok(svg.indexOf('coping cap') >= 0, 'build: edge metal cap present');
ok((svg.match(/pv-plan/g) || []).length > 40, 'build: substantial face count');

// membrane color comes from the section's resolved assembly in the result
var res = { sections: [{ id: est.sections[0].id, assembly: { membraneKey: 'tpo-60' } }] };
var svg2 = plan.build(est, C, res, { yaw: 0, tilt: 0 });
ok(svg2.indexOf('TPO 60-mil') >= 0, 'build: membrane label from resolved section assembly');

// stability: same inputs → identical string (safe for the _last render guard)
ok(plan.build(est, C, null, { yaw: 25, tilt: 40 }) === svg, 'build: deterministic output');

// zero-area estimate → friendly placeholder, no crash
var blank = engine.newEstimate(C);
ok(plan.build(blank, C, null, { yaw: 0, tilt: 0 }).indexOf('Enter a section area') >= 0,
  'build: empty estimate → placeholder message');

console.log('');
console.log(failed ? failed + ' FAILED' : 'ALL PLAN TESTS PASSED');
process.exitCode = failed ? 1 : 0;
