/*
 * Kodiak Single-Ply Roofing Estimator — calculation engine (js/engine.js)
 * Pure, DOM-free. computeEstimate(estimate, catalog) -> result. Never throws:
 * problems come back as result.errors [{sectionId|null, path?, msg}] and the
 * affected lines compute $0. No NaN can appear in serialized output — every
 * numeric read goes through num().
 *
 * Documented calc conventions (matched by tests/):
 *  - Waste % applies to both field membrane area and wall-flashing membrane
 *    area; the lap allowance (factors.flashLapAllowFt) is added to flashing
 *    height before waste.
 *  - Rolls are purchased whole per section: ceil((fieldGross+flashGross)/rollSqft).
 *    The purchased-roll cost is split between the field line and the flashing
 *    line exactly (flash share = total - rounded field share, so the two
 *    matTotals always sum to rolls x rollCost to the cent).
 *  - Insulation fastening is one pass through the whole stack: screw count is
 *    based on the TOP board layer (cover board if present, else last
 *    insulation layer): sum over zones of (zoneArea/boardSqft) x perBoard
 *    density, then ceil once. Densities: null/blank = error, 0 = valid
 *    (loose-laid). Fastening labor is included in the layer install rates.
 *  - Height/access factor multiplies HOURS on every line (line.hrs is the
 *    adjusted figure); laborTotal = hrs x rate, rate = baseRate x
 *    prevailingMult when project.prevailingWage.
 *  - Ballast tons are never rounded up (sold by weight). Dumpster pulls are
 *    computed ESTIMATE-WIDE from total tear-off tonnage.
 *  - orderList sums raw quantities across sections first, THEN ceils to
 *    purchase units (rolls, boards, pails, boxes; tons stay unrounded).
 */

/* ---------------- numeric + object helpers ---------------- */

function num(x, fb) {
  if (fb === undefined) fb = 0;
  var n = (typeof x === 'number') ? x : parseFloat(x);
  return (typeof n === 'number' && isFinite(n)) ? n : fb;
}
function isNil(x) { return x === null || x === undefined || x === ''; }
function r2(x) { return Math.round(num(x, 0) * 100) / 100; }
function r3(x) { return Math.round(num(x, 0) * 1000) / 1000; }
function ceilQ(x) { return Math.ceil(num(x, 0) - 1e-9); }

function isPlainObject(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

// Sparse deep-merge: values in `over` win; plain objects merge recursively.
function deepMerge(base, over) {
  if (!isPlainObject(base)) return (over === undefined ? base : over);
  var out = {};
  Object.keys(base).forEach(function (k) { out[k] = base[k]; });
  if (isPlainObject(over)) {
    Object.keys(over).forEach(function (k) {
      if (isPlainObject(over[k]) && isPlainObject(base[k])) out[k] = deepMerge(base[k], over[k]);
      else out[k] = over[k];
    });
  }
  return out;
}

function lookup(coll, key) {
  if (!isPlainObject(coll) || isNil(key)) return null;
  return Object.prototype.hasOwnProperty.call(coll, key) ? coll[key] : null;
}

function genId(prefix) {
  return (prefix || 'sec') + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1679616).toString(36);
}

/* ---------------- computeEstimate ---------------- */

function computeEstimate(estimate, catalog) {
  var res = {
    sections: [], lines: [], orderList: [],
    totals: {
      matCost: 0, laborCost: 0, laborHours: 0, equipCost: 0, disposalCost: 0,
      allowanceCost: 0, directCost: 0, overhead: 0, profit: 0, contingency: 0,
      materialTax: 0, grandTotal: 0, perSqFt: 0, totalSquares: 0
    },
    warnings: [], errors: []
  };
  if (!isPlainObject(estimate) || !isPlainObject(catalog)) {
    res.errors.push({ sectionId: null, msg: 'Missing estimate or catalog' });
    return res;
  }

  var proj = estimate.project || {};
  var markups = estimate.markups || {};
  var factors = catalog.factors || {};
  var labor = catalog.labor || {};
  var prod = catalog.prodRates || {};
  var baseAsm = estimate.assembly || {};

  // Labor rate + height/access factor (estimate-wide)
  var stories = Math.max(1, num(proj.stories, 1));
  var hf = 1 + (stories - 1) * num(factors.storyAddPct, 0) / 100 +
           (proj.tightAccess ? num(factors.tightAccessPct, 0) / 100 : 0);
  var rate = num(labor.baseRate, 0) * (proj.prevailingWage ? num(labor.prevailingMult, 1) : 1);

  // Zone split checksum (base assembly)
  var zsBase = (baseAsm.attachment || {}).zoneSplit || factors.zoneSplitDefault || {};
  var zsSum = num(zsBase.fieldPct, 0) + num(zsBase.perimPct, 0) + num(zsBase.cornerPct, 0);
  if (Math.abs(zsSum - 100) > 0.01) {
    res.warnings.push({ sectionId: null, msg: 'Zone split percentages sum to ' + r2(zsSum) + '% — expected 100%' });
  }

  /* ---- line + order accumulators ---- */
  var lines = [];
  function addLine(o) {
    var line = {
      sectionId: (o.sectionId === undefined ? null : o.sectionId),
      category: o.category,
      sku: o.sku || '',
      desc: o.desc || '',
      qty: r2(o.qty),
      unit: o.unit || '',
      unitMat: r2(o.unitMat),
      matTotal: r2(o.matTotal),
      hrs: r3(num(o.hrs, 0) * hf),
      laborTotal: 0,
      taxable: !!o.taxable
    };
    line.laborTotal = r2(line.hrs * rate);
    lines.push(line);
    return line;
  }

  var order = {};       // sku -> {sku, desc, raw, unit, per}
  var orderSeq = [];
  function addOrder(sku, desc, rawQty, unit, per) {
    rawQty = num(rawQty, 0);
    if (rawQty <= 0) return;
    if (!order[sku]) { order[sku] = { sku: sku, desc: desc, raw: 0, unit: unit, per: num(per, 0) }; orderSeq.push(sku); }
    order[sku].raw += rawQty;
  }

  function err(sectionId, path, msg) {
    var e = { sectionId: sectionId === undefined ? null : sectionId, msg: msg };
    if (path) e.path = path;
    res.errors.push(e);
  }

  function pickFastener(requiredIn) {
    var bestKey = null, best = null;
    var coll = catalog.fasteners || {};
    Object.keys(coll).forEach(function (k) {
      var f = coll[k];
      if (!isPlainObject(f)) return;
      if (num(f.lengthIn, 0) + 1e-9 < requiredIn) return;
      if (best === null || num(f.costEach, Infinity) < num(best.costEach, Infinity)) { best = f; bestKey = k; }
    });
    return best ? { key: bestKey, row: best } : null;
  }

  function plateByRole(role) {
    var coll = catalog.plates || {};
    var keys = Object.keys(coll);
    for (var i = 0; i < keys.length; i++) {
      var p = coll[keys[i]];
      if (isPlainObject(p) && p.role === role) return { key: keys[i], row: p };
    }
    return null;
  }

  /* ---- per-section computation ---- */
  var totalTons = 0, totalSquares = 0, totalArea = 0, anyWork = false, anyTapered = false;
  var resolvedAsm = {}; // section id → merged assembly, exposed on section results

  (Array.isArray(estimate.sections) ? estimate.sections : []).forEach(function (sec) {
    if (!isPlainObject(sec)) return;
    var sid = sec.id || null;
    var asm = deepMerge(baseAsm, sec.assemblyOverride);
    resolvedAsm[sid] = asm;
    var att = asm.attachment || {};
    var zs = att.zoneSplit || factors.zoneSplitDefault || {};

    var squares = num(sec.fieldSquares, 0);
    var area = squares * 100;
    totalSquares += squares;
    totalArea += area;
    if (area <= 0) {
      res.warnings.push({ sectionId: sid, msg: 'Section "' + (sec.name || sid || '?') + '" has zero roof area' });
    } else {
      anyWork = true;
    }

    var zoneA = {
      field: area * num(zs.fieldPct, 0) / 100,
      perim: area * num(zs.perimPct, 0) / 100,
      corner: area * num(zs.cornerPct, 0) / 100
    };

    /* -- tear-off / recover -- */
    if (sec.scope === 'tearoff' && area > 0) {
      var ex = lookup(catalog.existingRoofs, sec.existingRoofKey);
      if (!ex) {
        err(sid, 'sections.existingRoofKey', 'Existing roof type "' + (sec.existingRoofKey || '(none)') + '" not found in catalog');
      } else {
        var layers = Math.max(1, num(sec.existingLayers, 1));
        var tons = area * num(ex.lbsPerSqft, 0) * layers / 2000;
        totalTons += tons;
        addLine({
          sectionId: sid, category: 'demo', sku: 'tearoff-' + sec.existingRoofKey,
          desc: 'Tear off existing ' + (ex.label || sec.existingRoofKey) + ' — ' + layers + ' layer(s), ' + r2(tons) + ' tons',
          qty: squares * layers, unit: 'sq', unitMat: 0, matTotal: 0,
          hrs: squares * layers * num(ex.tearoffHrsPerSq, 0), taxable: false
        });
      }
    }
    if (sec.scope === 'recover' && area > 0 && isNil(asm.coverBoard)) {
      res.warnings.push({ sectionId: sid, msg: 'Recover over existing roof without a cover board — verify the assembly is acceptable' });
    }

    /* -- vapor retarder -- */
    if (!isNil(asm.vaporRetarder) && area > 0) {
      var vr = lookup(catalog.vaporRetarders, asm.vaporRetarder);
      if (!vr) {
        err(sid, 'assembly.vaporRetarder', 'Vapor retarder "' + asm.vaporRetarder + '" not found in catalog');
      } else {
        addLine({
          sectionId: sid, category: 'insulation', sku: asm.vaporRetarder,
          desc: (vr.label || asm.vaporRetarder),
          qty: squares, unit: 'sq', unitMat: num(vr.costPerSquare, 0),
          matTotal: squares * num(vr.costPerSquare, 0),
          hrs: squares * num(prod.vaporRetarderHrsPerSq, 0), taxable: true
        });
        addOrder(asm.vaporRetarder, vr.label || asm.vaporRetarder, squares, 'sq');
      }
    }

    /* -- insulation layers (flat stock) -- */
    var boardLayers = []; // bottom -> top, incl. cover board (pushed last)
    if (area > 0) {
      (Array.isArray(asm.insulationLayers) ? asm.insulationLayers : []).forEach(function (layer, idx) {
        var key = layer && layer.productKey;
        var row = lookup(catalog.insulations, key);
        if (!row) {
          err(sid, 'assembly.insulationLayers[' + idx + ']', 'Insulation "' + (key || '(none)') + '" not found in catalog');
          return;
        }
        if (row.pricing === 'perInchSqft') {
          err(sid, 'assembly.insulationLayers[' + idx + ']', 'Layer ' + (idx + 1) + ': "' + key + '" is a tapered product — set it via the Tapered field, not a flat layer');
          return;
        }
        var bs = num(row.boardSqft, 32) || 32;
        var waste = num(row.wastePct, 0);
        var rawBoards = area * (1 + waste / 100) / bs;
        var boards = ceilQ(rawBoards);
        addLine({
          sectionId: sid, category: 'insulation', sku: key,
          desc: (row.label || key) + ' — layer ' + (idx + 1),
          qty: boards, unit: 'board', unitMat: num(row.costPerBoard, 0),
          matTotal: boards * num(row.costPerBoard, 0),
          hrs: squares * num(prod.insulationHrsPerSq, 0), taxable: true
        });
        addOrder(key, row.label || key, rawBoards, 'board');
        boardLayers.push({ key: key, row: row });
      });
    }

    /* -- tapered (avg-thickness budget adder, per section) -- */
    if (isPlainObject(asm.tapered) && area > 0) {
      anyTapered = true;
      var tKey = null, tRow = null;
      var insColl = catalog.insulations || {};
      Object.keys(insColl).forEach(function (k) {
        if (!tRow && isPlainObject(insColl[k]) && insColl[k].pricing === 'perInchSqft') { tKey = k; tRow = insColl[k]; }
      });
      if (!tRow) {
        err(sid, 'assembly.tapered', 'No tapered insulation product (pricing "perInchSqft") in catalog');
      } else {
        var avgIn = num(asm.tapered.avgThicknessIn, 0);
        var tWaste = num(tRow.wastePct, 0);
        var tMat = area * (1 + tWaste / 100) * avgIn * num(tRow.costPerInchSqft, 0);
        addLine({
          sectionId: sid, category: 'insulation', sku: tKey,
          desc: (tRow.label || tKey) + ' — avg ' + avgIn + '" (budget shortcut, not a tapered layout)',
          qty: area, unit: 'sqft', unitMat: avgIn * num(tRow.costPerInchSqft, 0),
          matTotal: tMat, hrs: squares * num(prod.taperedHrsPerSq, 0), taxable: true
        });
        addOrder(tKey, tRow.label || tKey, area * (1 + tWaste / 100), 'sqft');
      }
    }

    /* -- cover board -- */
    if (!isNil(asm.coverBoard) && area > 0) {
      var cb = lookup(catalog.coverBoards, asm.coverBoard);
      if (!cb) {
        err(sid, 'assembly.coverBoard', 'Cover board "' + asm.coverBoard + '" not found in catalog');
      } else {
        var cbs = num(cb.boardSqft, 32) || 32;
        var cbWaste = num(cb.wastePct, 0);
        var cbRaw = area * (1 + cbWaste / 100) / cbs;
        var cbBoards = ceilQ(cbRaw);
        addLine({
          sectionId: sid, category: 'insulation', sku: asm.coverBoard,
          desc: (cb.label || asm.coverBoard),
          qty: cbBoards, unit: 'board', unitMat: num(cb.costPerBoard, 0),
          matTotal: cbBoards * num(cb.costPerBoard, 0),
          hrs: squares * num(prod.coverBoardHrsPerSq, 0), taxable: true
        });
        addOrder(asm.coverBoard, cb.label || asm.coverBoard, cbRaw, 'board');
        boardLayers.push({ key: asm.coverBoard, row: cb });
      }
    }

    /* -- membrane: field + flashing cut from the same purchased rolls -- */
    var mem = null;
    var flashLF = num((sec.wallFlash || {}).lf, 0);
    var flashH = num((sec.wallFlash || {}).avgHeightFt, 0);
    if (area > 0) {
      mem = lookup(catalog.membranes, asm.membraneKey);
      if (!mem) {
        err(sid, 'assembly.membraneKey', isNil(asm.membraneKey)
          ? 'No membrane selected'
          : 'Membrane "' + asm.membraneKey + '" not found in catalog');
      }
    }
    if (mem && area > 0) {
      var waste = !isNil(sec.wastePctOverride) ? num(sec.wastePctOverride, 0)
                : !isNil(asm.membraneWastePct) ? num(asm.membraneWastePct, 0)
                : num(mem.wasteDefaultPct, 0);
      var wf = 1 + waste / 100;
      var rollSqft = num(mem.rollWidthFt, 0) * num(mem.rollLengthFt, 0);
      if (rollSqft <= 0) {
        err(sid, 'assembly.membraneKey', 'Membrane "' + asm.membraneKey + '" has an invalid roll size');
      } else {
        var lap = num(factors.flashLapAllowFt, 0);
        var fieldGross = area * wf;
        var flashGross = flashLF * (flashH + lap) * wf;
        var gross = fieldGross + flashGross;
        var rolls = ceilQ(gross / rollSqft);
        var rollCost = num(mem.costPerSquare, 0) * rollSqft / 100;
        var totalMat = r2(rolls * rollCost);
        var fieldMat = gross > 0 ? r2(totalMat * fieldGross / gross) : 0;
        var flashMat = r2(totalMat - fieldMat); // exact complement — the two lines always sum to rolls x rollCost

        var methodRateKey = { mech: 'membraneMechHrsPerSq', adhered: 'membraneAdheredHrsPerSq', ballast: 'membraneBallastHrsPerSq' }[att.method] || 'membraneMechHrsPerSq';
        addLine({
          sectionId: sid, category: 'membrane', sku: asm.membraneKey,
          desc: (mem.label || asm.membraneKey) + ' — field membrane (' + rolls + ' rolls incl. flashing cut, ' + waste + '% waste)',
          qty: rolls, unit: 'roll', unitMat: rollCost, matTotal: fieldMat,
          hrs: squares * num(prod[methodRateKey], 0), taxable: true
        });
        if (flashLF > 0) {
          addLine({
            sectionId: sid, category: 'flashings', sku: asm.membraneKey + '-flash',
            desc: 'Wall flashing membrane — ' + flashLF + ' LF x ' + flashH + ' ft (+' + lap + ' ft lap), cut from field rolls',
            qty: flashLF, unit: 'lf', unitMat: flashLF > 0 ? flashMat / flashLF : 0, matTotal: flashMat,
            hrs: flashLF * num(prod.wallFlashHrsPerLF, 0), taxable: true
          });
        }
        addOrder(asm.membraneKey, mem.label || asm.membraneKey, gross, 'roll', rollSqft);

        if (mem.seamMethod === 'tape') {
          addLine({
            sectionId: sid, category: 'membrane', sku: asm.membraneKey + '-seamtape',
            desc: 'Seam tape & primer — ' + (mem.label || asm.membraneKey),
            qty: squares, unit: 'sq', unitMat: num(mem.seamMatPerSquare, 0),
            matTotal: squares * num(mem.seamMatPerSquare, 0),
            hrs: squares * num(prod.seamTapeAddHrsPerSq, 0), taxable: true
          });
          addOrder(asm.membraneKey + '-seamtape', 'Seam tape — ' + (mem.label || asm.membraneKey), squares, 'sq');
        }
      }
    }

    /* -- fastener length: stack thickness + deck embedment -- */
    var stackIn = 0;
    boardLayers.forEach(function (l) { stackIn += num(l.row.thicknessIn, 0); });
    if (isPlainObject(asm.tapered)) stackIn += num(asm.tapered.avgThicknessIn, 0);
    if (sec.scope === 'recover') stackIn += num(sec.existingStackIn, 0);
    var requiredIn = stackIn + num((catalog.deckEmbedment || {})[asm.deckType], 1);

    /* -- insulation fastening (any attachment method, when boards exist) -- */
    if (area > 0 && boardLayers.length > 0) {
      var d = att.insulationDensity || {};
      if (isNil(d.fieldPerBoard) || isNil(d.perimPerBoard) || isNil(d.cornerPerBoard)) {
        err(sid, 'assembly.attachment.insulationDensity',
          'Insulation fastening densities (per board: field / perimeter / corner) are required — enter manufacturer-approved values (0 is valid for loose-laid)');
        addLine({
          sectionId: sid, category: 'attachment', sku: 'ins-fastening',
          desc: 'Insulation fastening — DENSITIES REQUIRED (see manufacturer approval)',
          qty: 0, unit: 'ea', unitMat: 0, matTotal: 0, hrs: 0, taxable: true
        });
      } else {
        var top = boardLayers[boardLayers.length - 1]; // one fastening pass through the whole stack
        var tbs = num(top.row.boardSqft, 32) || 32;
        var rawScrews = zoneA.field / tbs * num(d.fieldPerBoard, 0)
                      + zoneA.perim / tbs * num(d.perimPerBoard, 0)
                      + zoneA.corner / tbs * num(d.cornerPerBoard, 0);
        if (rawScrews > 0) {
          var screws = ceilQ(rawScrews);
          var fp = pickFastener(requiredIn);
          if (!fp) {
            err(sid, 'catalog.fasteners', 'No catalog fastener is long enough for insulation fastening (need >= ' + r2(requiredIn) + '")');
            addLine({ sectionId: sid, category: 'attachment', sku: 'ins-fastening', desc: 'Insulation fastening — NO FASTENER LONG ENOUGH', qty: screws, unit: 'ea', unitMat: 0, matTotal: 0, hrs: 0, taxable: true });
          } else {
            addLine({
              sectionId: sid, category: 'attachment', sku: fp.key,
              desc: 'Insulation fastening — screws (' + (fp.row.label || fp.key) + ', through ' + r2(stackIn) + '" stack)',
              qty: screws, unit: 'ea', unitMat: num(fp.row.costEach, 0),
              matTotal: screws * num(fp.row.costEach, 0), hrs: 0, taxable: true
            });
            addOrder(fp.key, fp.row.label || fp.key, rawScrews, 'box', num(fp.row.boxQty, 0));
          }
          var pl = plateByRole('insulation');
          if (!pl) {
            err(sid, 'catalog.plates', 'No plate with role "insulation" found in catalog');
          } else {
            addLine({
              sectionId: sid, category: 'attachment', sku: pl.key,
              desc: 'Insulation fastening — plates (' + (pl.row.label || pl.key) + ')',
              qty: screws, unit: 'ea', unitMat: num(pl.row.costEach, 0),
              matTotal: screws * num(pl.row.costEach, 0), hrs: 0, taxable: true
            });
            addOrder(pl.key, pl.row.label || pl.key, rawScrews, 'box', num(pl.row.boxQty, 0));
          }
        }
      }
    }

    /* -- membrane attachment branch -- */
    if (area > 0 && mem) {
      if (att.method === 'mech') {
        var md = att.membraneDensity || {};
        if (isNil(md.fieldPerSq) || isNil(md.perimPerSq) || isNil(md.cornerPerSq)) {
          err(sid, 'assembly.attachment.membraneDensity',
            'Membrane fastening densities (per square: field / perimeter / corner) are required — enter manufacturer-approved values (0 is valid)');
          addLine({
            sectionId: sid, category: 'attachment', sku: 'mem-fastening',
            desc: 'Membrane fastening — DENSITIES REQUIRED (see manufacturer approval)',
            qty: 0, unit: 'ea', unitMat: 0, matTotal: 0, hrs: 0, taxable: true
          });
        } else {
          var rawCount = zoneA.field / 100 * num(md.fieldPerSq, 0)
                       + zoneA.perim / 100 * num(md.perimPerSq, 0)
                       + zoneA.corner / 100 * num(md.cornerPerSq, 0);
          if (rawCount > 0) {
            var count = ceilQ(rawCount);
            var fm = pickFastener(requiredIn);
            if (!fm) {
              err(sid, 'catalog.fasteners', 'No catalog fastener is long enough for membrane fastening (need >= ' + r2(requiredIn) + '")');
              addLine({ sectionId: sid, category: 'attachment', sku: 'mem-fastening', desc: 'Membrane fastening — NO FASTENER LONG ENOUGH', qty: count, unit: 'ea', unitMat: 0, matTotal: 0, hrs: 0, taxable: true });
            } else {
              addLine({
                sectionId: sid, category: 'attachment', sku: fm.key,
                desc: 'Membrane fastening — screws (' + (fm.row.label || fm.key) + ')',
                qty: count, unit: 'ea', unitMat: num(fm.row.costEach, 0),
                matTotal: count * num(fm.row.costEach, 0), hrs: 0, taxable: true
              });
              addOrder(fm.key, fm.row.label || fm.key, rawCount, 'box', num(fm.row.boxQty, 0));
            }
            var sp = plateByRole('seam');
            if (!sp) {
              err(sid, 'catalog.plates', 'No plate with role "seam" found in catalog');
            } else {
              addLine({
                sectionId: sid, category: 'attachment', sku: sp.key,
                desc: 'Membrane fastening — seam plates (' + (sp.row.label || sp.key) + ')',
                qty: count, unit: 'ea', unitMat: num(sp.row.costEach, 0),
                matTotal: count * num(sp.row.costEach, 0), hrs: 0, taxable: true
              });
              addOrder(sp.key, sp.row.label || sp.key, rawCount, 'box', num(sp.row.boxQty, 0));
            }
          }
        }
      } else if (att.method === 'adhered') {
        var adh = lookup(catalog.adhesives, att.adhesiveKey);
        if (!adh) {
          err(sid, 'assembly.attachment.adhesiveKey', isNil(att.adhesiveKey)
            ? 'Fully-adhered attachment needs an adhesive selection'
            : 'Adhesive "' + att.adhesiveKey + '" not found in catalog');
        } else {
          var cov = num(adh.coverageSqftPerGal, 0);
          if (cov <= 0) {
            err(sid, 'assembly.attachment.adhesiveKey', 'Adhesive "' + att.adhesiveKey + '" has no coverage rate');
          } else {
            var gal = (area + flashLF * flashH) / cov; // finished field + wall-flashing sqft
            var palGal = num(adh.palGal, 5) || 5;
            var pails = ceilQ(gal / palGal);
            addLine({
              sectionId: sid, category: 'attachment', sku: att.adhesiveKey,
              desc: (adh.label || att.adhesiveKey) + ' — ' + r2(gal) + ' gal incl. wall flashing',
              qty: pails, unit: 'pail', unitMat: num(adh.costPerPail, 0),
              matTotal: pails * num(adh.costPerPail, 0), hrs: 0, taxable: true
            });
            addOrder(att.adhesiveKey, adh.label || att.adhesiveKey, gal, 'pail', palGal);
          }
        }
      } else if (att.method === 'ballast') {
        var bal = lookup(catalog.ballasts, att.ballastKey);
        if (!bal) {
          err(sid, 'assembly.attachment.ballastKey', isNil(att.ballastKey)
            ? 'Ballasted attachment needs a ballast selection'
            : 'Ballast "' + att.ballastKey + '" not found in catalog');
        } else {
          var tonsB = area * num(bal.lbsPerSqft, 0) / 2000; // sold by weight — never rounded up
          addLine({
            sectionId: sid, category: 'attachment', sku: att.ballastKey,
            desc: (bal.label || att.ballastKey) + ' — ' + num(bal.lbsPerSqft, 0) + ' psf (tons unrounded, sold by weight)',
            qty: tonsB, unit: 'ton', unitMat: num(bal.costPerTon, 0),
            matTotal: tonsB * num(bal.costPerTon, 0),
            hrs: squares * num(prod.ballastSpreadHrsPerSq, 0), taxable: true
          });
          addOrder(att.ballastKey, bal.label || att.ballastKey, tonsB, 'ton');
        }
      }
    }

    /* -- edge metal / sheet metal -- */
    var em = sec.edgeMetal || {};
    var emLF = num(em.lf, 0);
    if (emLF > 0) {
      var emType = em.type || 'edge';
      var emRate = (catalog.flashings || {})[emType];
      if (isNil(emRate)) {
        err(sid, 'sections.edgeMetal.type', 'Edge metal type "' + emType + '" has no $/LF rate in the catalog');
      } else {
        addLine({
          sectionId: sid, category: 'sheetmetal', sku: 'metal-' + emType,
          desc: 'Sheet metal — ' + emType + ' (' + emLF + ' LF)',
          qty: emLF, unit: 'lf', unitMat: num(emRate, 0), matTotal: emLF * num(emRate, 0),
          hrs: emLF * num(prod.edgeMetalHrsPerLF, 0), taxable: true
        });
        addOrder('metal-' + emType, 'Sheet metal — ' + emType, emLF, 'lf');
      }
    }

    /* -- details -- */
    var pens = sec.penetrations || {};
    [
      { key: 'pipe',     qty: pens.pipe,     hrsKey: 'pipeHrsEach' },
      { key: 'curb',     qty: pens.curb,     hrsKey: 'curbHrsEach' },
      { key: 'skylight', qty: pens.skylight, hrsKey: 'skylightHrsEach' },
      { key: 'hvac',     qty: pens.hvac,     hrsKey: 'hvacHrsEach' },
      { key: 'drain',    qty: sec.drains,    hrsKey: 'drainHrsEach' },
      { key: 'scupper',  qty: sec.scuppers,  hrsKey: 'scupperHrsEach' }
    ].forEach(function (dd) {
      var q = num(dd.qty, 0);
      if (q <= 0) return;
      var row = lookup(catalog.details, dd.key);
      if (!row) {
        err(sid, 'catalog.details.' + dd.key, 'Detail "' + dd.key + '" not found in catalog');
        return;
      }
      addLine({
        sectionId: sid, category: 'details', sku: 'det-' + dd.key,
        desc: (row.label || dd.key),
        qty: q, unit: 'ea', unitMat: num(row.costEach, 0), matTotal: q * num(row.costEach, 0),
        hrs: q * num(prod[dd.hrsKey], 0), taxable: true
      });
      addOrder('det-' + dd.key, row.label || dd.key, q, 'ea');
    });

    /* -- unit-priced allowances (separate from % contingency) -- */
    var allowRates = catalog.allowances || {};
    var wi = num(sec.allowanceWetInsSqft, 0);
    if (wi > 0) {
      addLine({
        sectionId: sid, category: 'allowance', sku: 'allow-wet-ins',
        desc: 'ALLOWANCE — unit-priced — wet insulation replacement',
        qty: wi, unit: 'sqft', unitMat: num(allowRates.wetInsPerSqft, 0),
        matTotal: wi * num(allowRates.wetInsPerSqft, 0), hrs: 0, taxable: false
      });
    }
    var dr = num(sec.allowanceDeckRepairSqft, 0);
    if (dr > 0) {
      addLine({
        sectionId: sid, category: 'allowance', sku: 'allow-deck-repair',
        desc: 'ALLOWANCE — unit-priced — deck repair',
        qty: dr, unit: 'sqft', unitMat: num(allowRates.deckRepairPerSqft, 0),
        matTotal: dr * num(allowRates.deckRepairPerSqft, 0), hrs: 0, taxable: false
      });
    }
  });

  /* ---- estimate-wide lines ---- */

  // Disposal: dumpster pulls computed across ALL sections' tear-off tonnage.
  if (totalTons > 0) {
    var dump = (catalog.equipment || {}).dumpster || {};
    var cap = num(dump.capacityTons, 0);
    var pulls = cap > 0 ? ceilQ(totalTons / cap) : 0;
    if (cap <= 0) err(null, 'catalog.equipment.dumpster.capacityTons', 'Dumpster capacity is not set — disposal pulls cannot be computed');
    var dispCost = pulls * num(dump.perPull, 0) + totalTons * num(dump.perTon, 0);
    addLine({
      sectionId: null, category: 'demo', sku: 'disposal',
      desc: 'Disposal — ' + pulls + ' dumpster pull(s), ' + r2(totalTons) + ' tons (estimate-wide)',
      qty: totalTons, unit: 'ton', unitMat: 0, matTotal: dispCost, hrs: 0, taxable: false
    });
  }

  // Tapered design fee: one flat non-taxable service line per estimate.
  if (anyTapered && isPlainObject(baseAsm.tapered) && num(baseAsm.tapered.designFee, 0) > 0) {
    addLine({
      sectionId: null, category: 'insulation', sku: 'tapered-design',
      desc: 'Tapered design fee (non-taxable service)',
      qty: 1, unit: 'ea', unitMat: num(baseAsm.tapered.designFee, 0),
      matTotal: num(baseAsm.tapered.designFee, 0), hrs: 0, taxable: false
    });
  }

  // Equipment — hoisting type is interchangeable (crane / forklift)
  var HOISTING = {
    crane: { label: 'Crane', rateKey: 'craneDay' },
    forklift: { label: 'Forklift / telehandler', rateKey: 'forkliftDay' }
  };
  var equipCat = catalog.equipment || {};
  var equipDays = num(proj.craneDays, 0); // field name kept for stored-draft compat
  var hoist = HOISTING[proj.equipmentType || 'crane']; // 'none' → no entry → no line
  if (equipDays > 0 && hoist) {
    var equipRate = num(equipCat[hoist.rateKey], 0);
    addLine({
      sectionId: null, category: 'equipment', sku: proj.equipmentType || 'crane',
      desc: hoist.label + ' — ' + equipDays + ' day(s)',
      qty: equipDays, unit: 'day', unitMat: equipRate,
      matTotal: equipDays * equipRate, hrs: 0, taxable: false
    });
  }
  if (anyWork && num(equipCat.mobilization, 0) > 0) {
    addLine({
      sectionId: null, category: 'equipment', sku: 'mobilization',
      desc: 'Mobilization',
      qty: 1, unit: 'ea', unitMat: num(equipCat.mobilization, 0),
      matTotal: num(equipCat.mobilization, 0), hrs: 0, taxable: false
    });
  }

  /* ---- totals pipeline ---- */
  var mat = 0, laborCost = 0, laborHours = 0, equip = 0, disp = 0, allow = 0, taxableMat = 0;
  lines.forEach(function (l) {
    laborCost += l.laborTotal;
    laborHours += l.hrs;
    if (l.category === 'equipment') equip += l.matTotal;
    else if (l.category === 'allowance') allow += l.matTotal;
    else if (l.category === 'demo') disp += l.matTotal; // demo mat$ = disposal; demo labor stays labor
    else mat += l.matTotal;
    if (l.taxable) taxableMat += l.matTotal;
  });

  var direct = r2(mat + laborCost + equip + disp + allow);
  var overhead = r2(direct * num(markups.overheadPct, 0) / 100);
  var profit = r2((direct + overhead) * num(markups.profitPct, 0) / 100);
  var contingency = r2((direct + overhead + profit) * num(markups.contingencyPct, 0) / 100);
  var materialTax = r2(taxableMat * num(markups.materialTaxPct, 0) / 100);
  var grand = r2(direct + overhead + profit + contingency + materialTax);

  res.totals = {
    matCost: r2(mat),
    laborCost: r2(laborCost),
    laborHours: r2(laborHours),
    equipCost: r2(equip),
    disposalCost: r2(disp),
    allowanceCost: r2(allow),
    directCost: direct,
    overhead: overhead,
    profit: profit,
    contingency: contingency,
    materialTax: materialTax,
    grandTotal: grand,
    perSqFt: totalArea > 0 ? r2(grand / totalArea) : 0,
    totalSquares: r2(totalSquares)
  };

  res.lines = lines;

  /* ---- per-section roll-up ---- */
  res.sections = (Array.isArray(estimate.sections) ? estimate.sections : []).map(function (sec) {
    var sid = (sec && sec.id) || null;
    var sl = lines.filter(function (l) { return l.sectionId === sid && sid !== null; });
    var m = 0, lc = 0, h = 0;
    sl.forEach(function (l) { m += l.matTotal; lc += l.laborTotal; h += l.hrs; });
    return { id: sid, name: (sec && sec.name) || '', assembly: resolvedAsm[sid] || null,
      lines: sl, hours: r2(h), matCost: r2(m), laborCost: r2(lc) };
  });

  /* ---- procurement order list: sum raw quantities, THEN ceil ---- */
  res.orderList = orderSeq.map(function (sku) {
    var o = order[sku];
    var qty;
    switch (o.unit) {
      case 'roll':
      case 'pail':
        qty = o.per > 0 ? ceilQ(o.raw / o.per) : ceilQ(o.raw);
        break;
      case 'box':
        var pieces = ceilQ(o.raw);
        qty = o.per > 0 ? ceilQ(pieces / o.per) : pieces;
        break;
      case 'ton':
        qty = r2(o.raw); // sold by weight — never rounded up
        break;
      default: // board, sq, sqft, lf, ea
        qty = ceilQ(o.raw);
    }
    return { sku: o.sku, desc: o.desc, qty: qty, unit: o.unit };
  });

  return res;
}

/* ---------------- newEstimate factory ---------------- */

function blankSection(name) {
  return {
    id: genId('sec'), name: name || 'Roof Section', scope: 'new',
    existingRoofKey: null, existingLayers: 1, existingStackIn: 0,
    allowanceWetInsSqft: 0, allowanceDeckRepairSqft: 0,
    fieldSquares: 0, perimeterLF: 0,
    edgeMetal: { type: 'edge', lf: 0 },
    wallFlash: { lf: 0, avgHeightFt: 0 },
    penetrations: { pipe: 0, curb: 0, skylight: 0, hvac: 0 },
    drains: 0, scuppers: 0,
    templateKey: null, // display/bookkeeping: which system template filled assemblyOverride
    assemblyOverride: null, wastePctOverride: null, notes: ''
  };
}

function newEstimate(catalog) {
  catalog = isPlainObject(catalog) ? catalog : {};
  var md = catalog.markupDefaults || {};
  var zs = (catalog.factors || {}).zoneSplitDefault || {};
  return {
    schemaVersion: 1,
    project: {
      name: '', customer: '', address: '', city: '', state: 'CA',
      estimator: '', bidDate: '', prevailingWage: false,
      stories: 1, tightAccess: false, equipmentType: 'crane', craneDays: 0, notes: ''
    },
    assembly: {
      deckType: 'steel',
      vaporRetarder: null,
      insulationLayers: [],
      tapered: null,
      coverBoard: null,
      membraneKey: null,
      attachment: {
        method: 'mech',
        manufacturerAssemblyRef: '',
        zoneSplit: {
          fieldPct: num(zs.fieldPct, 80),
          perimPct: num(zs.perimPct, 15),
          cornerPct: num(zs.cornerPct, 5)
        },
        // Densities deliberately start EMPTY — no defaults are provided.
        insulationDensity: { fieldPerBoard: null, perimPerBoard: null, cornerPerBoard: null },
        membraneDensity: { fieldPerSq: null, perimPerSq: null, cornerPerSq: null },
        adhesiveKey: null,
        ballastKey: null
      },
      membraneWastePct: null
    },
    sections: [blankSection('Main Roof')],
    markups: {
      overheadPct: num(md.overheadPct, 10),
      profitPct: num(md.profitPct, 10),
      contingencyPct: num(md.contingencyPct, 0),
      materialTaxPct: num(md.materialTaxPct, 0)
    }
  };
}

if (typeof module !== 'undefined') module.exports = { computeEstimate: computeEstimate, newEstimate: newEstimate };
if (typeof window !== 'undefined') { window.KRE = window.KRE || {}; window.KRE.engine = { computeEstimate: computeEstimate, newEstimate: newEstimate }; }
