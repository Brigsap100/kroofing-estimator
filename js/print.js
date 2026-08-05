/* Kodiak Roofing Estimator — print output builder.
   Populates #print-root with either the internal cost breakdown or the
   client-facing proposal, then calls window.print(). No calculation here —
   everything is read from the engine result passed in. */

(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    n = isFinite(n) ? n : 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function qty(n) {
    n = isFinite(n) ? n : 0;
    return n % 1 === 0 ? String(n) : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function dateStr(s) {
    var d = s ? new Date(s + 'T12:00:00') : new Date();
    if (isNaN(d)) d = new Date();
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  var CAT_LABELS = {
    demo: 'Demolition & Disposal', insulation: 'Insulation', membrane: 'Membrane',
    attachment: 'Attachment', flashings: 'Flashings', sheetmetal: 'Sheet Metal',
    details: 'Details & Penetrations', equipment: 'Equipment', allowance: 'Allowances'
  };

  function letterhead(title) {
    return '<div class="ltr-head">' +
      '<img src="assets/img/logo.png" alt="Kodiak Roofing &amp; Waterproofing">' +
      '<div class="ltr-co"><b>Kodiak Roofing &amp; Waterproofing</b>' +
      '916.253.1900<br>Lic. CA #1119594 &middot; CA #732770 &middot; NV #0042603</div>' +
      '</div>' +
      '<h1>' + esc(title) + '</h1>';
  }

  function metaTable(p) {
    var rows = [
      ['Project', p.name], ['Customer', p.customer],
      ['Address', [p.address, p.city, p.state].filter(Boolean).join(', ')],
      ['Estimator', p.estimator], ['Date', dateStr(p.bidDate)]
    ];
    return '<table class="print-meta"><tbody>' + rows.map(function (r) {
      return '<tr><td class="k">' + esc(r[0]) + '</td><td>' + esc(r[1] || '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  /* ---------- internal cost breakdown ---------- */

  function linesTable(lines, matCost, laborCost) {
    var byCat = {};
    lines.forEach(function (l) { (byCat[l.category] = byCat[l.category] || []).push(l); });
    var html = '<table><thead><tr>' +
      '<th>Description</th><th class="num">Qty</th><th>Unit</th>' +
      '<th class="num">Mat $/unit</th><th class="num">Material</th>' +
      '<th class="num">Hours</th><th class="num">Labor</th><th class="num">Total</th>' +
      '</tr></thead><tbody>';
    Object.keys(CAT_LABELS).forEach(function (cat) {
      var rows = byCat[cat];
      if (!rows || !rows.length) return;
      html += '<tr class="group-row"><td colspan="8">' + esc(CAT_LABELS[cat]) + '</td></tr>';
      rows.forEach(function (l) {
        html += '<tr><td>' + esc(l.desc) + '</td>' +
          '<td class="num">' + qty(l.qty) + '</td><td>' + esc(l.unit) + '</td>' +
          '<td class="num">' + (l.unitMat ? money(l.unitMat) : '—') + '</td>' +
          '<td class="num">' + money(l.matTotal) + '</td>' +
          '<td class="num">' + (l.hrs ? qty(l.hrs) : '—') + '</td>' +
          '<td class="num">' + money(l.laborTotal) + '</td>' +
          '<td class="num">' + money((l.matTotal || 0) + (l.laborTotal || 0)) + '</td></tr>';
      });
    });
    html += '<tr class="total-row"><td colspan="4">Section subtotal</td>' +
      '<td class="num">' + money(matCost) + '</td><td></td>' +
      '<td class="num">' + money(laborCost) + '</td>' +
      '<td class="num">' + money((matCost || 0) + (laborCost || 0)) + '</td></tr>';
    return html + '</tbody></table>';
  }

  function internalHTML(estimate, result, opts) {
    var t = result.totals || {};
    var html = letterhead('Internal Cost Breakdown');
    html += metaTable(estimate.project || {});

    (result.sections || []).forEach(function (sec) {
      var meta = (estimate.sections || []).filter(function (s) { return s.id === sec.id; })[0] || {};
      html += '<h2>' + esc(meta.name || sec.id) +
        ' <span class="muted">— ' + qty(meta.fieldSquares || 0) + ' squares, ' + esc(meta.scope || '') + '</span></h2>';
      html += linesTable(sec.lines || [], sec.matCost, sec.laborCost);
    });

    if ((result.orderList || []).length) {
      html += '<h2>Material Order List</h2>' +
        '<table><thead><tr><th>Item</th><th class="num">Order qty</th><th>Unit</th></tr></thead><tbody>' +
        result.orderList.map(function (o) {
          return '<tr><td>' + esc(o.desc) + '</td><td class="num">' + qty(o.qty) + '</td>' +
            '<td>' + esc(o.unit) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    var water = [
      ['Material', t.matCost], ['Labor (' + qty(t.laborHours || 0) + ' hrs)', t.laborCost],
      ['Equipment', t.equipCost], ['Disposal', t.disposalCost], ['Allowances', t.allowanceCost],
      ['Direct cost', t.directCost],
      ['Overhead', t.overhead], ['Profit', t.profit], ['Contingency', t.contingency],
      ['Material tax', t.materialTax]
    ];
    html += '<h2>Totals</h2><table><tbody>' +
      water.map(function (r) {
        return '<tr><td>' + esc(r[0]) + '</td><td class="num">' + money(r[1] || 0) + '</td></tr>';
      }).join('') +
      '<tr class="total-row"><td>GRAND TOTAL</td><td class="num">' + money(t.grandTotal || 0) + '</td></tr>' +
      '<tr><td>Price per sq ft</td><td class="num">' + money(t.perSqFt || 0) + '</td></tr>' +
      '</tbody></table>';

    var notes = (result.errors || []).map(function (e) { return 'ERROR: ' + (e.msg || e); })
      .concat((result.warnings || []).map(function (w) { return 'Warning: ' + w; }));
    if (notes.length) {
      html += '<h2>Flags</h2><ul class="print-fine">' +
        notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    }

    if (opts && opts.sample) html += '<div class="watermark">SAMPLE RATES — NOT FOR BIDDING</div>';
    html += '<p class="print-foot">Internal use only — not for distribution.</p>';
    return html;
  }

  /* ---------- client proposal ---------- */

  function scopeBullets(estimate, catalog) {
    var a = estimate.assembly || {};
    var cat = catalog || {};
    var out = [];
    var sections = estimate.sections || [];

    var tearoffSecs = sections.filter(function (s) { return s.scope === 'tearoff'; });
    if (tearoffSecs.length) {
      var maxLayers = Math.max.apply(null, tearoffSecs.map(function (s) { return s.existingLayers || 1; }));
      out.push('Remove the existing roof system' + (maxLayers > 1 ? ' (' + maxLayers + ' layers)' : '') +
        ' down to the structural deck and legally dispose of all debris.');
    }
    if (sections.some(function (s) { return s.scope === 'recover'; })) {
      out.push('Prepare the existing roof surface to receive the new recover system.');
    }
    if (a.vaporRetarder && cat.vaporRetarders && cat.vaporRetarders[a.vaporRetarder]) {
      out.push('Install ' + cat.vaporRetarders[a.vaporRetarder].label + ' over the deck.');
    }
    var layers = a.insulationLayers || [];
    if (layers.length && cat.insulations) {
      var totalIn = 0, r = 0;
      var names = layers.map(function (l) {
        var p = cat.insulations[l.productKey];
        if (p) { totalIn += p.thicknessIn || 0; r += (p.thicknessIn || 0) * (p.rPerInch || 0); }
        return p ? p.label : l.productKey;
      });
      out.push('Install ' + layers.length + ' layer' + (layers.length > 1 ? 's' : '') +
        ' of insulation (' + names.join(' + ') + ', total ' + qty(totalIn) + '"' +
        (r ? ', approx. R-' + Math.round(r) : '') + ').');
    }
    if (a.tapered) {
      out.push('Install a tapered insulation system (average ' + qty(a.tapered.avgThicknessIn || 0) +
        '" thickness) to promote positive drainage.');
    }
    if (a.coverBoard && cat.coverBoards && cat.coverBoards[a.coverBoard]) {
      out.push('Install ' + cat.coverBoards[a.coverBoard].label + ' cover board.');
    }
    var mem = cat.membranes && cat.membranes[a.membraneKey];
    if (mem) {
      var att = a.attachment || {};
      var how = att.method === 'adhered' ? 'fully adhered' :
        att.method === 'ballast' ? 'loose-laid and ballasted' :
        'mechanically attached per the manufacturer-approved fastening pattern';
      var ref = att.manufacturerAssemblyRef ? ' (assembly ref: ' + att.manufacturerAssemblyRef + ')' : '';
      out.push('Install new ' + mem.label + ' membrane, ' + how + ref +
        ', with all seams ' + (mem.seamMethod === 'tape' ? 'spliced with seam tape' : 'heat-welded') + '.');
    }
    var flashLF = 0, edgeLF = 0;
    sections.forEach(function (s) {
      flashLF += (s.wallFlash && s.wallFlash.lf) || 0;
      edgeLF += (s.edgeMetal && s.edgeMetal.lf) || 0;
    });
    if (flashLF) out.push('Flash all walls and curbs with new membrane base flashings (approx. ' + qty(flashLF) + ' LF).');
    if (edgeLF) out.push('Furnish and install new perimeter edge metal / coping (approx. ' + qty(edgeLF) + ' LF).');

    var det = { pipe: 0, curb: 0, skylight: 0, hvac: 0, drain: 0, scupper: 0 };
    sections.forEach(function (s) {
      var p = s.penetrations || {};
      det.pipe += p.pipe || 0; det.curb += p.curb || 0; det.skylight += p.skylight || 0; det.hvac += p.hvac || 0;
      det.drain += s.drains || 0; det.scupper += s.scuppers || 0;
    });
    var detBits = [];
    if (det.pipe) detBits.push(det.pipe + ' pipe penetration' + (det.pipe > 1 ? 's' : ''));
    if (det.curb) detBits.push(det.curb + ' equipment curb' + (det.curb > 1 ? 's' : ''));
    if (det.skylight) detBits.push(det.skylight + ' skylight' + (det.skylight > 1 ? 's' : ''));
    if (det.hvac) detBits.push(det.hvac + ' HVAC unit' + (det.hvac > 1 ? 's' : ''));
    if (det.drain) detBits.push(det.drain + ' roof drain' + (det.drain > 1 ? 's' : ''));
    if (det.scupper) detBits.push(det.scupper + ' scupper' + (det.scupper > 1 ? 's' : ''));
    if (detBits.length) out.push('Flash and detail ' + detBits.join(', ') + '.');

    if (sections.some(function (s) { return (s.allowanceWetInsSqft || 0) > 0 || (s.allowanceDeckRepairSqft || 0) > 0; })) {
      out.push('Carried allowances for wet insulation replacement / deck repair are included as unit-priced ' +
        'allowance line items; quantities beyond the carried allowance will be handled by change order.');
    }
    out.push('Remove all job-related debris and leave the roof and grounds clean.');
    return out;
  }

  function proposalHTML(estimate, result, catalog) {
    var p = estimate.project || {};
    var t = result.totals || {};
    var html = letterhead('Roofing Proposal');
    html += metaTable(p);
    html += '<h2>Scope of Work</h2><ul class="scope-list">' +
      scopeBullets(estimate, catalog).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') +
      '</ul>';
    if (p.notes) html += '<h2>Notes</h2><p>' + esc(p.notes) + '</p>';
    html += '<div class="print-total"><span class="label">Total price</span>' +
      '<span class="amount">' + money(t.grandTotal || 0) + '</span></div>';
    html += '<p class="print-fine">This proposal is valid for 30 days from the date above. ' +
      'Work will be performed per manufacturer requirements and applicable codes. ' +
      'Exclusions and allowances as noted in the scope of work.</p>';
    html += '<div class="sig-row">' +
      '<div class="sig-line">Accepted by (signature)</div>' +
      '<div class="sig-line">Printed name / title</div>' +
      '<div class="sig-line">Date</div>' +
      '</div>';
    return html;
  }

  /* ---------- public API ---------- */

  function run(mode, html) {
    var root = document.getElementById('print-root');
    if (!root) return;
    root.innerHTML = html;
    root.hidden = false;
    document.body.classList.add(mode);
    var cleanup = function () {
      document.body.classList.remove('print-internal', 'print-proposal');
      root.hidden = true;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  var api = {
    printInternal: function (estimate, result, catalog, opts) {
      run('print-internal', internalHTML(estimate, result, opts || {}));
    },
    printProposal: function (estimate, result, catalog) {
      run('print-proposal', proposalHTML(estimate, result, catalog));
    },
    scopeBullets: scopeBullets
  };

  if (typeof window !== 'undefined') { window.KRE = window.KRE || {}; window.KRE.print = api; }
  if (typeof module !== 'undefined') module.exports = api;
})();
