/* Tests for the pure parts of js/importer.js (CSV parsing, tabular mapping,
   free-text extraction, PDF text-operator decoding). Run: node tests/importer.test.js */
'use strict';

var imp = require('../js/importer.js');

var failed = 0;
function eq(actual, expected, msg) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? '  PASS  ' : '  FAIL  ') + msg + (ok ? '' : '  got=' + JSON.stringify(actual) + ' want=' + JSON.stringify(expected)));
  if (!ok) failed++;
}
function ok(cond, msg) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + msg);
  if (!cond) failed++;
}

/* --- parseCSV --- */
eq(imp.parseCSV('a,b\n1,"x, y"\n'), [['a', 'b'], ['1', 'x, y']], 'CSV: quoted comma');
eq(imp.parseCSV('a\tb\n1\t2\n'), [['a', 'b'], ['1', '2']], 'TSV: tab delimiter auto-detected');
eq(imp.parseCSV('a,"he said ""hi"""\n'), [['a', 'he said "hi"']], 'CSV: escaped quotes');
eq(imp.parseCSV('a,b\r\n1,2'), [['a', 'b'], ['1', '2']], 'CSV: CRLF + no trailing newline');

/* --- template round-trip --- */
var tplExtract = imp.mapTabular(imp.parseCSV(imp.csvTemplate()));
eq(tplExtract.project.name, 'Example Distribution Center', 'template: project name');
eq(tplExtract.project.state, 'CA', 'template: state');
eq(tplExtract.project.stories, 1, 'template: stories numeric');
eq(tplExtract.sections.length, 2, 'template: two sections');
eq(tplExtract.sections[0].name, 'Main Roof', 'template: section name');
eq(tplExtract.sections[0].fieldSquares, 120, 'template: squares');
eq(tplExtract.sections[0].perimeterLF, 480, 'template: perimeter');
eq(tplExtract.sections[0].flashHeightFt, 2, 'template: flashing height');
eq(tplExtract.sections[0].scope, 'tearoff', 'template: scope normalized');
eq(tplExtract.sections[0].existingLayers, 1, 'template: existing layers');
eq(tplExtract.sections[1].name, 'Penthouse', 'template: second section');

/* --- header synonyms + sqft→squares --- */
var syn = imp.mapTabular(imp.parseCSV(
  'Client,Acme\n' +
  'Roof Section,Area SqFt,Total Perimeter,Roof Drains,RTUs,Scope\n' +
  'North Wing,"12,500",620,6,2,Tear-Off & Replace\n'));
eq(syn.project.customer, 'Acme', 'synonyms: Client → customer');
eq(syn.sections[0].fieldSquares, 125, 'synonyms: 12,500 sqft → 125 squares');
eq(syn.sections[0].perimeterLF, 620, 'synonyms: Total Perimeter → perimeterLF');
eq(syn.sections[0].drains, 6, 'synonyms: Roof Drains → drains');
eq(syn.sections[0].hvac, 2, 'synonyms: RTUs → hvac');
eq(syn.sections[0].scope, 'tearoff', 'synonyms: "Tear-Off & Replace" → tearoff');

/* --- garbage in → empty extract, no throw --- */
var junk = imp.mapTabular(imp.parseCSV('hello world\nno,real,columns,here\n'));
eq(junk.sections.length, 0, 'junk CSV: no sections invented');
eq(Object.keys(junk.project).length, 0, 'junk CSV: no project fields invented');

/* --- free-text (PDF) heuristics --- */
var pdfText = 'Measurement Report — 123 Industrial Way, Sacramento, CA 95814. ' +
  'Total Roof Area: 45,200 sq ft. Total Perimeter: 1,240 LF. Parapet Wall: 380 LF. ' +
  '12 pipe penetrations, 4 roof drains, 2 scuppers, 3 HVAC units, 1 skylight.';
var ex = imp.extractFromText(pdfText);
eq(ex.sections.length, 1, 'text: one section produced');
eq(ex.sections[0].fieldSquares, 452, 'text: 45,200 sqft → 452 squares');
eq(ex.sections[0].perimeterLF, 1240, 'text: perimeter LF');
eq(ex.sections[0].flashLf, 380, 'text: parapet → flashing LF');
eq(ex.sections[0].drains, 4, 'text: drains');
eq(ex.sections[0].scuppers, 2, 'text: scuppers');
eq(ex.sections[0].pipe, 12, 'text: penetrations');
eq(ex.sections[0].hvac, 3, 'text: HVAC');
eq(ex.sections[0].skylight, 1, 'text: skylight');
ok(/123 Industrial Way/.test(ex.project.address || ''), 'text: address captured');

var empty = imp.extractFromText('completely unrelated prose about bears');
eq(empty.sections.length, 0, 'text: nothing invented from unrelated prose');

/* --- squares stated as squares (not sqft) --- */
var sqEx = imp.extractFromText('Field area 120 squares, perimeter 480');
eq(sqEx.sections[0].fieldSquares, 120, 'text: "120 squares" not divided by 100');

/* --- PDF text operators --- */
eq(imp.textOpsToString('BT (Total Area) Tj (45,200 sq ft) Tj ET'), 'Total Area 45,200 sq ft', 'pdf ops: Tj strings');
eq(imp.textOpsToString('[(Peri)-20(meter: 1,240 LF)] TJ'), 'Perimeter: 1,240 LF', 'pdf ops: TJ array with kerning');
eq(imp.textOpsToString('(a \\(b\\) c) Tj'), 'a (b) c', 'pdf ops: escaped parens');

console.log('');
console.log(failed ? failed + ' FAILED' : 'ALL IMPORTER TESTS PASSED');
process.exitCode = failed ? 1 : 0;
