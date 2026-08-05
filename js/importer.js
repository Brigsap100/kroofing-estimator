/* Kodiak Roofing Estimator — file import.
   Parses estimate/catalog JSON, CSV/TSV takeoff sheets, Excel .xlsx (minimal
   built-in zip+XML reader) and text-based PDF measurement reports (built-in
   FlateDecode via DecompressionStream) — all in the browser, no libraries.
   Extraction is best-effort by design: results go to a review panel in ui.js
   and are never applied without the user pressing Apply. */

(function () {
  'use strict';

  /* ================= pure helpers (node-testable) ================= */

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function toNum(s) {
    var v = parseFloat(String(s == null ? '' : s).replace(/[$,\s]/g, ''));
    return isFinite(v) ? v : null;
  }

  /* --- CSV/TSV --- */

  function detectDelim(text) {
    var line = (text.split(/\r?\n/).filter(function (l) { return l.trim(); })[0] || '');
    var counts = [[',', (line.match(/,/g) || []).length],
      ['\t', (line.match(/\t/g) || []).length],
      [';', (line.match(/;/g) || []).length]];
    counts.sort(function (a, b) { return b[1] - a[1]; });
    return counts[0][1] > 0 ? counts[0][0] : ',';
  }

  function parseCSV(text, delim) {
    delim = delim || detectDelim(text);
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  /* --- tabular → extract mapping --- */

  var PROJECT_KEYS = {
    project: 'name', projectname: 'name', jobname: 'name', job: 'name', name: 'name',
    customer: 'customer', client: 'customer', owner: 'customer',
    address: 'address', city: 'city', state: 'state',
    estimator: 'estimator', stories: 'stories', notes: 'notes', cranedays: 'craneDays'
  };

  var SECTION_COLS = {
    section: 'name', sectionname: 'name', roofsection: 'name', roof: 'name',
    squares: 'fieldSquares', fieldsquares: 'fieldSquares', sq: 'fieldSquares', areasquares: 'fieldSquares',
    sqft: 'sqft', squarefeet: 'sqft', areasqft: 'sqft', area: 'sqft', fieldareasqft: 'sqft',
    perimeterlf: 'perimeterLF', perimeter: 'perimeterLF', totalperimeter: 'perimeterLF',
    edgemetallf: 'edgeLf', edgemetal: 'edgeLf', edgelf: 'edgeLf', copinglf: 'edgeLf', coping: 'edgeLf',
    flashinglf: 'flashLf', wallflashinglf: 'flashLf', wallflashing: 'flashLf', walllf: 'flashLf', curbflashinglf: 'flashLf',
    flashingheightft: 'flashHeightFt', flashheight: 'flashHeightFt', flashingheight: 'flashHeightFt', flashheightft: 'flashHeightFt',
    pipes: 'pipe', pipe: 'pipe', penetrations: 'pipe', pipepenetrations: 'pipe',
    curbs: 'curb', curb: 'curb', equipmentcurbs: 'curb',
    skylights: 'skylight', skylight: 'skylight',
    hvac: 'hvac', hvacunits: 'hvac', rtus: 'hvac', rtu: 'hvac',
    drains: 'drains', roofdrains: 'drains', drain: 'drains',
    scuppers: 'scuppers', scupper: 'scuppers',
    scope: 'scope', existinglayers: 'existingLayers', layers: 'existingLayers', tearofflayers: 'existingLayers'
  };

  function normScope(s) {
    var n = norm(s);
    if (!n) return null;
    if (/tear|remov|replac|demo/.test(n)) return 'tearoff';
    if (/recover|overlay|retrofit/.test(n)) return 'recover';
    if (/new/.test(n)) return 'new';
    return null;
  }

  function mapTabular(rows) {
    var extract = { project: {}, sections: [], notes: [] };
    var headerIdx = -1, colMap = null;

    rows.forEach(function (r, i) {
      if (headerIdx >= 0) return;
      var mapped = {}, hits = 0;
      r.forEach(function (cell, c) {
        var key = SECTION_COLS[norm(cell)];
        if (key && !(key in mapped)) { mapped[c] = key; hits++; }
      });
      // a real section header names at least 2 known columns incl. an area one
      var vals = Object.keys(mapped).map(function (c) { return mapped[c]; });
      if (hits >= 2 && (vals.indexOf('fieldSquares') >= 0 || vals.indexOf('sqft') >= 0)) {
        headerIdx = i; colMap = mapped;
      }
    });

    var kvLimit = headerIdx >= 0 ? headerIdx : rows.length;
    for (var i = 0; i < kvLimit; i++) {
      var r = rows[i];
      if (!r || r.length < 2) continue;
      var pk = PROJECT_KEYS[norm(r[0])];
      var v = String(r[1] == null ? '' : r[1]).trim();
      if (pk && v !== '') {
        extract.project[pk] = (pk === 'stories' || pk === 'craneDays') ? toNum(v) : v;
        extract.notes.push('Project ' + pk + ': "' + v + '" (row ' + (i + 1) + ')');
      }
    }

    if (headerIdx >= 0) {
      for (var j = headerIdx + 1; j < rows.length; j++) {
        var row = rows[j];
        if (!row || row.every(function (c) { return String(c).trim() === ''; })) continue;
        var sec = {};
        Object.keys(colMap).forEach(function (c) {
          var key = colMap[c], raw = row[c];
          if (raw == null || String(raw).trim() === '') return;
          if (key === 'name') sec.name = String(raw).trim();
          else if (key === 'scope') { var sc = normScope(raw); if (sc) sec.scope = sc; }
          else {
            var n = toNum(raw);
            if (n != null) sec[key] = n;
          }
        });
        if (sec.sqft != null && sec.fieldSquares == null) {
          sec.fieldSquares = Math.round(sec.sqft / 100 * 100) / 100;
          delete sec.sqft;
        } else delete sec.sqft;
        if (Object.keys(sec).length) {
          sec.name = sec.name || ('Section ' + (extract.sections.length + 1));
          extract.sections.push(sec);
        }
      }
      extract.notes.push('Section table found (row ' + (headerIdx + 1) + '): ' +
        extract.sections.length + ' section(s)');
    }
    return extract;
  }

  /* --- free-text (PDF) heuristics --- */

  function extractFromText(text) {
    var extract = { project: {}, sections: [], notes: [] };
    var sec = {};
    var t = text.replace(/\s+/g, ' ');

    function grab(re, label, apply) {
      var m = t.match(re);
      if (m) { apply(m); extract.notes.push(label + ': matched "' + m[0].trim().slice(0, 60) + '"'); }
    }

    grab(/(?:total\s*(?:roof)?\s*area|roof\s*area|field\s*area)\D{0,24}?([\d,]+(?:\.\d+)?)\s*(sq(?:uare)?\s*(?:ft|feet)|sf|squares?)?/i,
      'Roof area', function (m) {
        var n = toNum(m[1]);
        if (n == null) return;
        var unit = norm(m[2] || '');
        sec.fieldSquares = /^squares?$/.test(unit) ? n : Math.round(n / 100 * 100) / 100;
      });
    grab(/(?:total\s*)?perimeter\D{0,24}?([\d,]+(?:\.\d+)?)/i, 'Perimeter LF',
      function (m) { sec.perimeterLF = toNum(m[1]); });
    grab(/(?:parapet|wall)\s*(?:flashing)?\D{0,24}?([\d,]+(?:\.\d+)?)\s*(?:lf|linear|lin\.?\s*ft)/i, 'Wall/parapet LF',
      function (m) { sec.flashLf = toNum(m[1]); });
    grab(/([\d,]+)\s*(?:roof\s*)?drains?\b|drains?\D{0,12}?([\d,]+)/i, 'Drains',
      function (m) { sec.drains = toNum(m[1] || m[2]); });
    grab(/([\d,]+)\s*scuppers?\b|scuppers?\D{0,12}?([\d,]+)/i, 'Scuppers',
      function (m) { sec.scuppers = toNum(m[1] || m[2]); });
    grab(/([\d,]+)\s*(?:pipe\s*)?penetrations?\b|penetrations?\D{0,12}?([\d,]+)/i, 'Penetrations',
      function (m) { sec.pipe = toNum(m[1] || m[2]); });
    grab(/([\d,]+)\s*skylights?\b|skylights?\D{0,12}?([\d,]+)/i, 'Skylights',
      function (m) { sec.skylight = toNum(m[1] || m[2]); });
    grab(/([\d,]+)\s*(?:hvac|rtu)s?\s*(?:units?)?\b|(?:hvac|rtu)s?\s*(?:units?)?\D{0,12}?([\d,]+)/i, 'HVAC units',
      function (m) { sec.hvac = toNum(m[1] || m[2]); });
    grab(/(\d+\s+[A-Za-z0-9 .]+?\s(?:st(?:reet)?|ave(?:nue)?|road|rd|blvd|boulevard|dr(?:ive)?|way|court|ct|pkwy|lane|ln)\b\.?(?:,?\s*[A-Za-z .]+,?\s*(?:CA|NV)(?:\s*\d{5})?)?)/i,
      'Address', function (m) { extract.project.address = m[1].trim(); });

    if (Object.keys(sec).length) {
      sec.name = 'Main Roof';
      extract.sections.push(sec);
    }
    return extract;
  }

  /* --- CSV template --- */

  function csvTemplate() {
    return [
      'Project,Example Distribution Center',
      'Customer,Example Property Group',
      'Address,123 Example St',
      'City,Sacramento',
      'State,CA',
      'Estimator,Your name',
      'Stories,1',
      '',
      'Section,Squares,Perimeter LF,Edge Metal LF,Flashing LF,Flashing Height FT,Pipes,Curbs,Skylights,HVAC,Drains,Scuppers,Scope,Existing Layers',
      'Main Roof,120,480,480,150,2,8,2,0,3,4,0,tearoff,1',
      'Penthouse,15,160,160,60,1.5,2,0,0,1,1,0,tearoff,1'
    ].join('\n') + '\n';
  }

  /* ================= browser-only file handling ================= */

  function latin1(bytes) {
    var out = '', CH = 8192;
    for (var i = 0; i < bytes.length; i += CH) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, bytes.length)));
    }
    return out;
  }

  function inflate(bytes, format) {
    // format: 'deflate' (zlib-wrapped, PDF FlateDecode) or 'deflate-raw' (zip)
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('This browser cannot decompress files — use CSV or JSON instead.'));
    }
    var ds = new DecompressionStream(format);
    return new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer()
      .then(function (ab) { return new Uint8Array(ab); });
  }

  /* --- minimal .xlsx (zip) reader --- */

  function unzip(buf, wantRe) {
    var b = new Uint8Array(buf);
    var dv = new DataView(buf);
    var i = b.length - 22;
    var min = Math.max(0, b.length - 65557);
    while (i >= min && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < min) return Promise.reject(new Error('Not a valid .xlsx (zip directory not found).'));
    var count = dv.getUint16(i + 10, true);
    var off = dv.getUint32(i + 16, true);
    var jobs = [];
    for (var e = 0; e < count; e++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true);
      var compSize = dv.getUint32(off + 20, true);
      var nameLen = dv.getUint16(off + 28, true);
      var extraLen = dv.getUint16(off + 30, true);
      var commentLen = dv.getUint16(off + 32, true);
      var localOff = dv.getUint32(off + 42, true);
      var name = latin1(b.subarray(off + 46, off + 46 + nameLen));
      if (wantRe.test(name)) {
        jobs.push((function (name, method, compSize, localOff) {
          var nl = dv.getUint16(localOff + 26, true);
          var el = dv.getUint16(localOff + 28, true);
          var data = b.subarray(localOff + 30 + nl + el, localOff + 30 + nl + el + compSize);
          var p = method === 8 ? inflate(data, 'deflate-raw') :
            method === 0 ? Promise.resolve(new Uint8Array(data)) :
            Promise.reject(new Error('Unsupported zip compression in .xlsx'));
          return p.then(function (out) { return { name: name, bytes: out }; });
        })(name, method, compSize, localOff));
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    return Promise.all(jobs);
  }

  function colLettersToIndex(ref) {
    var m = String(ref || '').match(/^([A-Z]+)/);
    if (!m) return -1;
    var n = 0;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }

  function xlsxToRows(buf) {
    return unzip(buf, /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/).then(function (entries) {
      var dec = new TextDecoder('utf-8');
      var shared = [];
      var sheetXml = null, sheetName = null;
      entries.forEach(function (e) {
        if (/sharedStrings/.test(e.name)) {
          var sdoc = new DOMParser().parseFromString(dec.decode(e.bytes), 'application/xml');
          var sis = sdoc.getElementsByTagName('si');
          for (var i = 0; i < sis.length; i++) shared.push(sis[i].textContent);
        } else if (!sheetName || e.name < sheetName) { sheetName = e.name; sheetXml = e.bytes; }
      });
      if (!sheetXml) throw new Error('No worksheet found in .xlsx');
      var doc = new DOMParser().parseFromString(dec.decode(sheetXml), 'application/xml');
      var rows = [];
      var rowEls = doc.getElementsByTagName('row');
      for (var r = 0; r < rowEls.length; r++) {
        var out = [];
        var cells = rowEls[r].getElementsByTagName('c');
        for (var c = 0; c < cells.length; c++) {
          var cell = cells[c];
          var idx = colLettersToIndex(cell.getAttribute('r'));
          if (idx < 0) idx = out.length;
          var t = cell.getAttribute('t');
          var v = '';
          if (t === 'inlineStr') v = cell.textContent;
          else {
            var vEl = cell.getElementsByTagName('v')[0];
            v = vEl ? vEl.textContent : '';
            if (t === 's') v = shared[parseInt(v, 10)] || '';
          }
          while (out.length < idx) out.push('');
          out[idx] = v;
        }
        rows.push(out);
      }
      return rows;
    });
  }

  /* --- minimal PDF text extraction --- */

  function pdfUnescape(s) {
    return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, function (_, c) {
      var map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (c in map) return map[c];
      return String.fromCharCode(parseInt(c, 8));
    });
  }

  function textOpsToString(content) {
    var out = [];
    var re = /\(((?:\\.|[^\\()])*)\)\s*(Tj|')|\[((?:\((?:\\.|[^\\()])*\)|[^\]])*)\]\s*TJ/g;
    var m;
    while ((m = re.exec(content))) {
      if (m[1] != null) out.push(pdfUnescape(m[1]));
      else if (m[3] != null) {
        var inner = m[3], re2 = /\(((?:\\.|[^\\()])*)\)/g, m2, parts = [];
        while ((m2 = re2.exec(inner))) parts.push(pdfUnescape(m2[1]));
        out.push(parts.join(''));
      }
    }
    return out.join(' ');
  }

  function pdfToText(buf) {
    var bytes = new Uint8Array(buf);
    var s = latin1(bytes);
    if (s.indexOf('%PDF') !== 0) return Promise.reject(new Error('Not a PDF file.'));
    var jobs = [];
    var re = /stream\r?\n/g, m;
    while ((m = re.exec(s))) {
      var start = m.index + m[0].length;
      var end = s.indexOf('endstream', start);
      if (end < 0) break;
      var dictStart = s.lastIndexOf('<<', m.index);
      var dict = dictStart >= 0 ? s.slice(dictStart, m.index) : '';
      var data = bytes.subarray(start, end);
      if (/(DCTDecode|JPXDecode|CCITTFaxDecode|Image)/.test(dict)) { re.lastIndex = end + 9; continue; }
      if (/FlateDecode/.test(dict)) {
        jobs.push(inflate(data, 'deflate').then(function (out) { return latin1(out); }, function () { return ''; }));
      } else {
        jobs.push(Promise.resolve(latin1(data)));
      }
      re.lastIndex = end + 9;
    }
    return Promise.all(jobs).then(function (chunks) {
      var text = chunks.map(function (c) {
        return /(Tj|TJ)/.test(c) ? textOpsToString(c) : '';
      }).filter(Boolean).join('\n');
      return text;
    });
  }

  /* --- dispatcher --- */

  function readAs(file, mode) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('Could not read the file.')); };
      if (mode === 'text') fr.readAsText(file); else fr.readAsArrayBuffer(file);
    });
  }

  function parseFile(file) {
    var name = (file && file.name) || '';
    var ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
    ext = ext ? ext.toLowerCase() : '';

    if (ext === 'json') {
      return readAs(file, 'text').then(function (text) {
        var obj = JSON.parse(text);
        if (obj && obj.sections && obj.assembly) return { kind: 'estimate', estimate: obj, sourceName: name };
        if (obj && obj.membranes && obj.meta) return { kind: 'catalog', catalog: obj, sourceName: name };
        throw new Error('JSON recognized as neither an estimate nor a catalog export.');
      });
    }
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      return readAs(file, 'text').then(function (text) {
        var extract = mapTabular(parseCSV(text));
        if (!extract.sections.length && !Object.keys(extract.project).length) {
          // not tabular — try free-text heuristics
          extract = extractFromText(text);
        }
        return { kind: 'extract', extract: extract, sourceName: name };
      });
    }
    if (ext === 'xlsx') {
      return readAs(file, 'buffer').then(xlsxToRows).then(function (rows) {
        return { kind: 'extract', extract: mapTabular(rows), sourceName: name };
      });
    }
    if (ext === 'xls') {
      return Promise.reject(new Error('Old-format .xls is not supported — save it as .xlsx or .csv first.'));
    }
    if (ext === 'pdf') {
      return readAs(file, 'buffer').then(pdfToText).then(function (text) {
        var extract = extractFromText(text);
        if (!text.trim()) {
          extract.notes.push('No text could be extracted — this looks like a scanned/image PDF.');
        }
        return { kind: 'extract', extract: extract, sourceName: name };
      });
    }
    return Promise.reject(new Error('Unsupported file type ".' + ext + '" — use JSON, CSV, XLSX, or PDF.'));
  }

  /* ================= exports ================= */

  var api = {
    parseFile: parseFile,
    csvTemplate: csvTemplate,
    // pure pieces exposed for node tests
    parseCSV: parseCSV,
    mapTabular: mapTabular,
    extractFromText: extractFromText,
    textOpsToString: textOpsToString
  };

  if (typeof window !== 'undefined') { window.KRE = window.KRE || {}; window.KRE.importer = api; }
  if (typeof module !== 'undefined') module.exports = api;
})();
