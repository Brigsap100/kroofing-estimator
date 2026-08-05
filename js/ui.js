/* Kodiak Roofing Estimator — UI layer.
   Only file that touches the DOM with event listeners. State lives in App;
   inputs carry data-path (+ data-type) and write into App.estimate or, with
   data-scope="catalog", into App.catalog. Keystrokes re-render ONLY the
   results panel, never the form — focus is preserved by construction. */

(function () {
  'use strict';

  var App = { estimate: null, catalog: null, customized: false, lastResult: null, ui: {}, userTemplates: {} };
  var secCounter = 0;

  /* ---------- helpers ---------- */

  function $(id) { return document.getElementById(id); }
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
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function getPath(obj, path) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length && obj != null; i++) obj = obj[parts[i]];
    return obj;
  }
  function setPath(obj, path, v) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length - 1; i++) {
      if (obj[parts[i]] == null) obj[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = v;
  }
  function coerce(el) {
    var t = el.dataset.type || (el.type === 'checkbox' ? 'bool' : 'str');
    if (t === 'bool') return el.checked;
    if (t === 'num') {
      if (el.value === '') return null;
      var v = parseFloat(el.value);
      return isFinite(v) ? v : null;
    }
    if (t === 'key') return el.value === '' ? null : el.value;
    return el.value;
  }
  function val(v) { return v == null ? '' : v; }
  function numInput(path, v, extra) {
    return '<input type="number" inputmode="decimal" data-type="num" data-path="' + path + '" value="' +
      val(v) + '" ' + (extra || '') + '>';
  }
  function options(obj, selected, noneLabel) {
    // no "None" choice + nothing selected yet → honest placeholder so the
    // state (null) never silently disagrees with what the select displays
    var html = noneLabel != null ?
      '<option value=""' + (selected == null ? ' selected' : '') + '>' + esc(noneLabel) + '</option>' :
      (selected == null ? '<option value="" disabled selected>Select…</option>' : '');
    Object.keys(obj || {}).forEach(function (k) {
      html += '<option value="' + esc(k) + '"' + (k === selected ? ' selected' : '') + '>' +
        esc(obj[k].label || k) + '</option>';
    });
    return html;
  }
  function newSectionObj() {
    var tpl = KRE.engine.newEstimate(App.catalog).sections[0];
    tpl.id = 'sx' + Date.now().toString(36) + (secCounter++);
    tpl.name = 'Section ' + (App.estimate.sections.length + 1);
    return tpl;
  }
  function flash(btn, text) {
    var orig = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = orig; }, 1200);
  }

  /* ---------- static form fill (project + markups cards) ---------- */

  function fillStatic() {
    ['project-card', 'markups-card'].forEach(function (id) {
      var card = $(id);
      if (!card) return;
      card.querySelectorAll('[data-path]').forEach(function (el) {
        var v = getPath(App.estimate, el.dataset.path);
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = val(v);
      });
    });
  }

  /* ---------- system templates ---------- */
  /* Built-ins ship in catalog.systemTemplates; user-saved ones live in their
     own store (kre.templates) so they survive a catalog reset and never touch
     the SAMPLE-rates "customized" flag. */

  function allTemplates() {
    return Object.assign({}, App.catalog.systemTemplates, App.userTemplates);
  }

  /* One owner for the templateKey/assemblyOverride pair — they must never
     disagree. */
  function setSectionTemplate(sec, key) {
    var tpl = key && allTemplates()[key];
    sec.templateKey = tpl ? key : null;
    sec.assemblyOverride = tpl ? clone(tpl.assembly) : null;
  }

  function uniqueSlug(name, taken, fallback) {
    var k = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
    while (taken[k]) k += '2';
    return k;
  }

  /* Sparse snapshot of the current assembly for saving as a template.
     Zone split, densities, and the assembly reference are deliberately NOT
     captured — they stay job-specific (liability rule). */
  function assemblySnapshot() {
    var a = App.estimate.assembly;
    return {
      vaporRetarder: a.vaporRetarder,
      insulationLayers: clone(a.insulationLayers || []),
      tapered: a.tapered ? clone(a.tapered) : null,
      coverBoard: a.coverBoard,
      membraneKey: a.membraneKey,
      attachment: {
        method: a.attachment.method,
        adhesiveKey: a.attachment.adhesiveKey,
        ballastKey: a.attachment.ballastKey
      }
    };
  }

  /* ---------- assembly card ---------- */

  function layerRow(tag, isMembrane, inner) {
    return '<div class="layer' + (isMembrane ? ' membrane' : '') + '">' +
      '<span class="layer-tag">' + tag + '</span><div class="layer-main">' + inner + '</div></div>';
  }

  function renderAssembly() {
    var a = App.estimate.assembly;
    var c = App.catalog;
    var att = a.attachment;
    var mem = (c.membranes || {})[a.membraneKey];
    var wastePh = mem && mem.wasteDefaultPct != null ? 'default ' + mem.wasteDefaultPct + '%' : 'waste %';
    var hasBoards = (a.insulationLayers || []).length > 0 || !!a.coverBoard;
    var flatIns = {};
    Object.keys(c.insulations || {}).forEach(function (k) {
      if (c.insulations[k].pricing !== 'perInchSqft') flatIns[k] = c.insulations[k];
    });

    var h = '<div class="tpl-bar">' +
      '<select id="tpl-select">' + options(allTemplates(), null, 'System templates…') + '</select>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="tpl-apply">Apply</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="tpl-save">Save current as…</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="tpl-delete">Delete</button>' +
      '</div>';

    h += '<div class="layer-stack">';

    h += layerRow('Membrane', true,
      '<div class="layer-row"><select data-path="assembly.membraneKey" data-struct="assembly">' +
      options(c.membranes, a.membraneKey) + '</select>' +
      numInput('assembly.membraneWastePct', a.membraneWastePct,
        'step="1" min="0" placeholder="' + esc(wastePh) + '" title="Membrane waste % (blank = catalog default)" style="max-width:110px"') +
      '</div>');

    h += layerRow('Cover board', false,
      '<select data-type="key" data-path="assembly.coverBoard" data-struct="assembly">' +
      options(c.coverBoards, a.coverBoard, 'None') + '</select>');

    var tapInner = '<label class="check-row"><input type="checkbox" data-action="toggle-tapered"' +
      (a.tapered ? ' checked' : '') + '><span>Tapered insulation system</span></label>';
    if (a.tapered) {
      tapInner += '<div class="layer-row" style="margin-top:8px">' +
        '<div class="field"><label>Avg thickness (in)</label>' +
        numInput('assembly.tapered.avgThicknessIn', a.tapered.avgThicknessIn, 'step="0.25" min="0"') + '</div>' +
        '<div class="field"><label>Design fee ($)</label>' +
        numInput('assembly.tapered.designFee', a.tapered.designFee, 'step="50" min="0"') + '</div></div>';
    }
    h += layerRow('Tapered', false, tapInner);

    var insInner = (a.insulationLayers || []).map(function (layer, i) {
      return '<div class="layer-row"><select data-path="assembly.insulationLayers.' + i + '.productKey">' +
        options(flatIns, layer.productKey) + '</select>' +
        '<button type="button" class="icon-btn danger" data-action="rm-layer" data-i="' + i + '" title="Remove layer">&times;</button></div>';
    }).join('');
    insInner += '<button type="button" class="btn btn-ghost btn-sm" data-action="add-layer">+ Add layer</button>';
    h += layerRow('Insulation', false, insInner);

    h += layerRow('Vapor ret.', false,
      '<select data-type="key" data-path="assembly.vaporRetarder">' +
      options(c.vaporRetarders, a.vaporRetarder, 'None') + '</select>');

    h += layerRow('Deck', false,
      '<select data-path="assembly.deckType">' +
      Object.keys(c.deckEmbedment || {}).map(function (k) {
        return '<option value="' + k + '"' + (k === a.deckType ? ' selected' : '') + '>' +
          k.charAt(0).toUpperCase() + k.slice(1) + '</option>';
      }).join('') + '</select>');

    h += '</div>'; // /.layer-stack

    // attachment
    h += '<h3 class="sc-h">Attachment</h3>';
    h += '<div class="seg" role="radiogroup">';
    [['mech', 'Mech. attached'], ['adhered', 'Fully adhered'], ['ballast', 'Ballasted']].forEach(function (m) {
      h += '<label><input type="radio" name="attach-method" value="' + m[0] + '" data-path="assembly.attachment.method" data-struct="assembly"' +
        (att.method === m[0] ? ' checked' : '') + '><span>' + m[1] + '</span></label>';
    });
    h += '</div>';

    h += '<div class="fgrid asm-sub">';
    h += '<div class="field full"><label>Manufacturer-approved assembly reference</label>' +
      '<input type="text" data-path="assembly.attachment.manufacturerAssemblyRef" value="' +
      esc(att.manufacturerAssemblyRef) + '" placeholder="e.g. Carlisle FM 1-90, RoofNav #123456"></div>';
    h += '<div class="field full"><label>Zone split — % field / perimeter / corner <span id="zone-sum" class="zone-sum"></span></label>' +
      '<div class="zone-row">' +
      numInput('assembly.attachment.zoneSplit.fieldPct', att.zoneSplit.fieldPct, 'step="1" min="0" max="100"') +
      numInput('assembly.attachment.zoneSplit.perimPct', att.zoneSplit.perimPct, 'step="1" min="0" max="100"') +
      numInput('assembly.attachment.zoneSplit.cornerPct', att.zoneSplit.cornerPct, 'step="1" min="0" max="100"') +
      '</div><p class="mini-note">True ASCE 7 zone widths depend on building dimensions — set these to match your uplift design.</p></div>';

    if (att.method === 'adhered') {
      h += '<div class="field"><label>Adhesive</label><select data-path="assembly.attachment.adhesiveKey">' +
        options(c.adhesives, att.adhesiveKey) + '</select></div>';
    }
    if (att.method === 'ballast') {
      h += '<div class="field"><label>Ballast</label><select data-path="assembly.attachment.ballastKey">' +
        options(c.ballasts, att.ballastKey) + '</select></div>';
    }
    h += '</div>'; // /.fgrid

    if (hasBoards) {
      h += '<div class="liability-note"><strong>Insulation fastening density</strong> — fasteners per board (field / perimeter / corner). ' +
        'Enter manufacturer-approved assembly values; <strong>no defaults are provided</strong>. Use 0 only for loose-laid/ballasted boards.' +
        '<div class="zone-row">' +
        numInput('assembly.attachment.insulationDensity.fieldPerBoard', att.insulationDensity.fieldPerBoard, 'step="1" min="0" placeholder="required"') +
        numInput('assembly.attachment.insulationDensity.perimPerBoard', att.insulationDensity.perimPerBoard, 'step="1" min="0" placeholder="required"') +
        numInput('assembly.attachment.insulationDensity.cornerPerBoard', att.insulationDensity.cornerPerBoard, 'step="1" min="0" placeholder="required"') +
        '</div></div>';
    }
    if (att.method === 'mech') {
      h += '<div class="liability-note"><strong>Membrane fastening density</strong> — fasteners per square (field / perimeter / corner). ' +
        'Enter manufacturer-approved assembly values; <strong>no defaults are provided</strong>.' +
        '<div class="zone-row">' +
        numInput('assembly.attachment.membraneDensity.fieldPerSq', att.membraneDensity.fieldPerSq, 'step="1" min="0" placeholder="required"') +
        numInput('assembly.attachment.membraneDensity.perimPerSq', att.membraneDensity.perimPerSq, 'step="1" min="0" placeholder="required"') +
        numInput('assembly.attachment.membraneDensity.cornerPerSq', att.membraneDensity.cornerPerSq, 'step="1" min="0" placeholder="required"') +
        '</div></div>';
    }

    $('assembly-body').innerHTML = h;
    updateZoneSum();
  }

  function updateZoneSum() {
    var el = $('zone-sum');
    if (!el) return;
    var z = App.estimate.assembly.attachment.zoneSplit;
    var sum = (z.fieldPct || 0) + (z.perimPct || 0) + (z.cornerPct || 0);
    el.textContent = '= ' + qty(sum) + '%';
    el.classList.toggle('bad', Math.abs(sum - 100) > 0.01);
  }

  /* ---------- section cards ---------- */

  function renderSections() {
    var c = App.catalog;
    var tpls = allTemplates();
    $('sections-list').innerHTML = App.estimate.sections.map(function (s, i) {
      var collapsed = !!App.ui.collapsed[s.id];
      var p = 'sections.' + i + '.';
      var b = '<div class="sec-card' + (collapsed ? ' collapsed' : '') + '" data-sec-id="' + esc(s.id) + '">';
      b += '<div class="sc-head">' +
        '<span class="sc-caret">&#9654;</span>' +
        '<input type="text" class="sc-title" data-path="' + p + 'name" value="' + esc(s.name) + '">' +
        '<span class="sc-meta"><span class="sc-squares">' + qty(s.fieldSquares || 0) + ' sq</span>' +
        '<span class="sc-sub" data-sec-total="' + esc(s.id) + '"></span></span>' +
        '<span class="sc-btns">' +
        '<button type="button" class="icon-btn" data-action="dup-section" data-i="' + i + '" title="Duplicate section">&#10697;</button>' +
        '<button type="button" class="icon-btn danger" data-action="rm-section" data-i="' + i + '" title="Remove section">&times;</button>' +
        '</span></div>';
      b += '<div class="sc-body">';

      b += '<div class="fgrid"><div class="field full"><label>System' +
        (s.templateKey ? ' <span class="muted">(template overrides the estimate assembly)</span>' : '') +
        '</label><select data-action="sec-template" data-i="' + i + '">' +
        options(tpls, s.templateKey, 'Estimate assembly (default)') + '</select></div></div>';

      b += '<h3 class="sc-h">Areas &amp; edges</h3><div class="fgrid">' +
        '<div class="field"><label>Field area (squares)</label>' + numInput(p + 'fieldSquares', s.fieldSquares, 'step="1" min="0"') + '</div>' +
        '<div class="field"><label>Perimeter (LF)</label>' + numInput(p + 'perimeterLF', s.perimeterLF, 'step="10" min="0"') + '</div>' +
        '<div class="field"><label>Edge metal type</label><select data-path="' + p + 'edgeMetal.type">' +
        [['edge', 'Edge metal'], ['coping', 'Coping'], ['termBar', 'Termination bar']].map(function (o) {
          return '<option value="' + o[0] + '"' + (s.edgeMetal.type === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>Edge metal (LF)</label>' + numInput(p + 'edgeMetal.lf', s.edgeMetal.lf, 'step="10" min="0"') + '</div>' +
        '<div class="field"><label>Wall/curb flashing (LF)</label>' + numInput(p + 'wallFlash.lf', s.wallFlash.lf, 'step="10" min="0"') + '</div>' +
        '<div class="field"><label>Flashing avg height (ft)</label>' + numInput(p + 'wallFlash.avgHeightFt', s.wallFlash.avgHeightFt, 'step="0.5" min="0"') + '</div>' +
        '</div>';

      b += '<h3 class="sc-h">Details</h3><div class="fgrid">' +
        '<div class="field"><label>Pipes / penetrations</label>' + numInput(p + 'penetrations.pipe', s.penetrations.pipe, 'step="1" min="0"') + '</div>' +
        '<div class="field"><label>Equipment curbs</label>' + numInput(p + 'penetrations.curb', s.penetrations.curb, 'step="1" min="0"') + '</div>' +
        '<div class="field"><label>Skylights</label>' + numInput(p + 'penetrations.skylight', s.penetrations.skylight, 'step="1" min="0"') + '</div>' +
        '<div class="field"><label>HVAC units</label>' + numInput(p + 'penetrations.hvac', s.penetrations.hvac, 'step="1" min="0"') + '</div>' +
        '<div class="field"><label>Roof drains</label>' + numInput(p + 'drains', s.drains, 'step="1" min="0"') + '</div>' +
        '<div class="field"><label>Scuppers</label>' + numInput(p + 'scuppers', s.scuppers, 'step="1" min="0"') + '</div>' +
        '</div>';

      b += '<h3 class="sc-h">Scope</h3><div class="seg">' +
        [['tearoff', 'Tear-off'], ['recover', 'Recover'], ['new', 'New']].map(function (o) {
          return '<label><input type="radio" name="scope-' + esc(s.id) + '" value="' + o[0] +
            '" data-path="' + p + 'scope" data-struct="sections"' + (s.scope === o[0] ? ' checked' : '') +
            '><span>' + o[1] + '</span></label>';
        }).join('') + '</div>';
      if (s.scope === 'tearoff') {
        b += '<div class="fgrid asm-sub">' +
          '<div class="field"><label>Existing roof</label><select data-path="' + p + 'existingRoofKey">' +
          options(c.existingRoofs, s.existingRoofKey) + '</select></div>' +
          '<div class="field"><label>Existing layers</label>' + numInput(p + 'existingLayers', s.existingLayers, 'step="1" min="1"') + '</div>' +
          '<div class="field"><label>Wet-insulation allowance (sq ft)</label>' + numInput(p + 'allowanceWetInsSqft', s.allowanceWetInsSqft, 'step="50" min="0"') + '</div>' +
          '<div class="field"><label>Deck-repair allowance (sq ft)</label>' + numInput(p + 'allowanceDeckRepairSqft', s.allowanceDeckRepairSqft, 'step="50" min="0"') + '</div>' +
          '</div>';
      }
      if (s.scope === 'recover') {
        b += '<div class="fgrid asm-sub"><div class="field"><label>Existing stack thickness (in — sets fastener length)</label>' +
          numInput(p + 'existingStackIn', s.existingStackIn, 'step="0.5" min="0"') + '</div></div>';
      }
      b += '<div class="fgrid asm-sub">' +
        '<div class="field"><label>Section waste % override</label>' + numInput(p + 'wastePctOverride', s.wastePctOverride, 'step="1" min="0" placeholder="assembly default"') + '</div>' +
        '<div class="field"><label>Notes</label><input type="text" data-path="' + p + 'notes" value="' + esc(s.notes) + '"></div>' +
        '</div>';

      b += '</div></div>';
      return b;
    }).join('');
  }

  /* ---------- results panel ---------- */

  var rafId = null;
  function scheduleResults() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = null; renderResults(); });
  }

  function renderResults() {
    var res;
    try {
      res = KRE.engine.computeEstimate(App.estimate, App.catalog);
    } catch (e) {
      $('res-errors').innerHTML = '<li>Calculation failed: ' + esc(e.message) + '</li>';
      return;
    }
    App.lastResult = res;
    var t = res.totals || {};

    $('res-total').textContent = money(t.grandTotal);
    $('res-persf').textContent = money(t.perSqFt) + ' / sq ft · ' + qty(t.totalSquares || 0) + ' squares · ' + qty(t.laborHours || 0) + ' hrs';

    var direct = t.directCost || 0;
    var segs = [['bar-mat', t.matCost, 'Material'], ['bar-labor', t.laborCost, 'Labor'],
      ['bar-other', (t.equipCost || 0) + (t.disposalCost || 0) + (t.allowanceCost || 0), 'Equip + misc']];
    $('res-split').innerHTML = direct > 0 ? segs.map(function (s) {
      var pct = Math.max(0, Math.min(100, Math.round((s[1] || 0) / direct * 100)));
      return '<div class="bar-row"><span class="bar-name">' + s[2] + '</span>' +
        '<div class="bar"><span class="' + s[0] + '" style="width:' + pct + '%"></span></div>' +
        '<span class="bar-val num">' + money(s[1] || 0) + '</span></div>';
    }).join('') : '';

    $('res-errors').innerHTML = (res.errors || []).map(function (e) {
      return '<li>' + esc(e.msg || e) + '</li>';
    }).join('');
    $('res-warnings').innerHTML = (res.warnings || []).map(function (w) {
      return '<li>' + esc(w.msg || w) + '</li>';
    }).join('');

    var lh = '';
    (res.sections || []).forEach(function (sec) {
      var meta = App.estimate.sections.filter(function (s) { return s.id === sec.id; })[0] || {};
      lh += '<table><tbody><tr class="group-row"><td colspan="4">' + esc(meta.name || sec.id) + '</td></tr>';
      (sec.lines || []).forEach(function (l) {
        lh += '<tr><td>' + esc(l.desc) + '</td><td class="num">' + qty(l.qty) + ' ' + esc(l.unit) + '</td>' +
          '<td class="num">' + money(l.matTotal) + '</td><td class="num">' + money(l.laborTotal) + '</td></tr>';
      });
      lh += '<tr class="total-row"><td>Subtotal</td><td></td><td class="num">' + money(sec.matCost) +
        '</td><td class="num">' + money(sec.laborCost) + '</td></tr></tbody></table>';
      var badge = document.querySelector('[data-sec-total="' + sec.id + '"]');
      if (badge) badge.textContent = money((sec.matCost || 0) + (sec.laborCost || 0));
    });
    $('res-lines').innerHTML = lh || '<p class="muted">No line items yet.</p>';

    $('res-order').innerHTML = (res.orderList || []).length ?
      '<table><tbody>' + res.orderList.map(function (o) {
        return '<tr><td>' + esc(o.desc) + '</td><td class="num">' + qty(o.qty) + ' ' + esc(o.unit) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="muted">Nothing to order yet.</p>';

    var mt = $('msum-total'), mp = $('msum-persf');
    if (mt) mt.textContent = money(t.grandTotal);
    if (mp) mp.textContent = money(t.perSqFt) + ' / sq ft';

    renderPreview();
  }

  /* ---------- interactive roof preview ---------- */

  var MEMBRANE_FILLS = { tpo: '#e9e9e9', pvc: '#cdd9e5', epdm: '#4a4a4a' };

  /* Interactive SVG shape: pv = {name, cats, sku?} feeds the hover detail. */
  function pvEl(shape, attrs, pv) {
    var a = ' class="pv-el' + (attrs['class'] ? ' ' + attrs['class'] : '') + '"' +
      ' data-pvname="' + esc(pv.name) + '" data-pvcats="' + (pv.cats || '') + '"' +
      (pv.sku ? ' data-pvsku="' + esc(pv.sku) + '"' : '') + ' tabindex="0"';
    Object.keys(attrs).forEach(function (k) {
      if (k !== 'class') a += ' ' + k + '="' + attrs[k] + '"';
    });
    return '<' + shape + a + '/>';
  }

  function countBadge(x, y, n) {
    return '<g class="pv-badge"><circle cx="' + x + '" cy="' + y + '" r="9"/>' +
      '<text x="' + x + '" y="' + (y + 3.5) + '">' + n + '</text></g>';
  }

  function renderPreview() {
    var tabsEl = $('preview-tabs'), svgEl = $('preview-svg');
    if (!tabsEl || !svgEl) return;
    var secs = App.estimate.sections;
    var idx = Math.min(App.ui.previewSec || 0, secs.length - 1);
    App.ui.previewSec = idx;
    var s = secs[idx];

    var tabsHtml = secs.length > 1 ? secs.map(function (sec, i) {
      return '<button type="button" class="' + (i === idx ? 'active' : '') +
        '" data-action="pv-tab" data-i="' + i + '">' + esc(sec.name || ('Section ' + (i + 1))) + '</button>';
    }).join('') : '';
    if (tabsEl._last !== tabsHtml) { tabsEl._last = tabsHtml; tabsEl.innerHTML = tabsHtml; }

    // Draw exactly what the engine priced: it resolves template overrides and
    // exposes the merged assembly on each section result.
    var secRes = ((App.lastResult || {}).sections || []).filter(function (x) { return x.id === s.id; })[0];
    var asm = (secRes && secRes.assembly) || App.estimate.assembly;
    var c = App.catalog;
    var mem = (c.membranes || {})[asm.membraneKey];
    var memType = mem ? mem.type : (String(asm.membraneKey || '').split('-')[0] || 'tpo');
    var memFill = MEMBRANE_FILLS[memType] || '#e9e9e9';
    var method = (asm.attachment || {}).method || 'mech';

    // ---- geometry: stack grows upward from the deck at y=190 ----
    var L = 78, R = 620, deckY = 190;
    var y = deckY, svg = '';

    // one stacked full-width layer: decrement y, then draw
    function stackLayer(h, cls, pv, style) {
      y -= h;
      var at = { x: L, y: y, width: R - L, height: h, 'class': cls };
      if (style) at.style = style;
      svg += pvEl('rect', at, pv);
      return h;
    }

    // deck (hovering it shows demo lines on tear-off jobs)
    svg += pvEl('rect', { x: L, y: deckY, width: R - L, height: 26, 'class': 'pv-deck' },
      { name: 'Deck — ' + (asm.deckType || 'steel') + (s.scope === 'tearoff' ? ' (tear-off below)' : ''), cats: 'demo' });
    var zig = '';
    for (var zx = L; zx < R - 12; zx += 12) zig += 'M' + zx + ' 208 l6 -8 l6 8 ';
    svg += '<path d="' + zig + '" class="pv-deck-flute"/>';
    svg += '<text x="' + ((L + R) / 2) + '" y="232" class="pv-dim" text-anchor="middle">' +
      esc((asm.deckType || 'steel') + ' deck') + '</text>';

    // vapor retarder
    if (asm.vaporRetarder) {
      stackLayer(5, 'pv-vr',
        { name: ((c.vaporRetarders || {})[asm.vaporRetarder] || {}).label || 'Vapor retarder', cats: 'insulation', sku: asm.vaporRetarder });
    }

    // insulation layers (bottom → top)
    (asm.insulationLayers || []).forEach(function (layer) {
      var p = (c.insulations || {})[layer.productKey] || {};
      var h = stackLayer(Math.max(9, Math.min(22, (p.thicknessIn || 2) * 7)), 'pv-ins',
        { name: p.label || 'Insulation', cats: 'insulation', sku: layer.productKey });
      if (h >= 12) svg += '<text x="' + (L + 8) + '" y="' + (y + h / 2 + 3.5) + '" class="pv-lbl">' + esc(p.label || '') + '</text>';
    });

    // tapered wedge (high left → drains right)
    if (asm.tapered) {
      var th = 13;
      svg += pvEl('polygon', { points: L + ',' + (y - th) + ' ' + R + ',' + y + ' ' + L + ',' + y, 'class': 'pv-taper' },
        { name: 'Tapered insulation (avg ' + qty(asm.tapered.avgThicknessIn || 0) + '")', cats: 'insulation' });
      y -= th;
    }

    // cover board
    if (asm.coverBoard) {
      stackLayer(7, 'pv-cover',
        { name: ((c.coverBoards || {})[asm.coverBoard] || {}).label || 'Cover board', cats: 'insulation', sku: asm.coverBoard });
    }

    // membrane
    stackLayer(7, 'pv-mem', { name: mem ? mem.label : 'Membrane (not selected)', cats: 'membrane' }, 'fill:' + memFill);
    var top = y;

    // attachment
    if (method === 'mech') {
      var g = '';
      for (var fx = L + 40; fx < R - 20; fx += 52) {
        g += '<line x1="' + fx + '" y1="' + (top + 3) + '" x2="' + fx + '" y2="' + (deckY + 8) + '"/>' +
          '<line x1="' + (fx - 4) + '" y1="' + (top + 4) + '" x2="' + (fx + 4) + '" y2="' + (top + 4) + '"/>';
      }
      svg += '<g class="pv-el pv-fast" data-pvname="Mechanical attachment (fasteners &amp; plates)" data-pvcats="attachment" tabindex="0">' + g + '</g>';
    } else if (method === 'adhered') {
      var wave = 'M' + L + ' ' + (top + 9);
      for (var wx = L; wx < R - 16; wx += 16) wave += ' q8 -5 16 0';
      svg += '<path d="' + wave + '" class="pv-el pv-glue" data-pvname="Bonding adhesive (fully adhered)" data-pvcats="attachment" tabindex="0"/>';
    } else if (method === 'ballast') {
      var rocks = '';
      for (var bx = L + 12; bx < R - 10; bx += 17) {
        rocks += '<circle cx="' + bx + '" cy="' + (top - 5) + '" r="4.5"/>' +
          '<circle cx="' + (bx + 8) + '" cy="' + (top - 9) + '" r="3.5"/>';
      }
      svg += '<g class="pv-el pv-ballast" data-pvname="Ballast (loose-laid)" data-pvcats="attachment" tabindex="0">' + rocks + '</g>';
      top -= 12;
    }

    // parapet wall + flashing (left)
    var flashFt = (s.wallFlash && s.wallFlash.avgHeightFt) || 0;
    var wallTop = Math.max(28, top - 22 - flashFt * 9);
    svg += '<rect x="40" y="' + wallTop + '" width="38" height="' + (deckY + 26 - wallTop) + '" class="pv-wall"/>';
    if ((s.wallFlash && s.wallFlash.lf) > 0) {
      svg += pvEl('path', {
        d: 'M' + L + ' ' + (y + 3) + ' L' + L + ' ' + (wallTop + 6) + ' L52 ' + (wallTop + 6),
        'class': 'pv-flash', style: 'stroke:' + (memType === 'epdm' ? '#4a4a4a' : '#b9b9b9')
      }, { name: 'Wall/curb flashing — ' + qty(s.wallFlash.lf) + ' LF × ' + qty(flashFt) + ' ft', cats: 'flashings' });
      svg += '<text x="30" y="' + ((wallTop + deckY) / 2) + '" class="pv-dim" text-anchor="middle" transform="rotate(-90 30 ' + ((wallTop + deckY) / 2) + ')">' +
        qty(flashFt) + ' ft</text>';
    }
    // coping on the wall + edge metal on the right
    svg += pvEl('rect', { x: 36, y: wallTop - 6, width: 46, height: 6, rx: 2, 'class': 'pv-metal' },
      { name: 'Coping / wall cap', cats: 'sheetmetal' });
    if ((s.edgeMetal && s.edgeMetal.lf) > 0) {
      svg += pvEl('path', { d: 'M' + (R - 2) + ' ' + (y - 2) + ' h10 v16', 'class': 'pv-metal-line' },
        { name: 'Edge metal (' + esc(s.edgeMetal.type) + ') — ' + qty(s.edgeMetal.lf) + ' LF', cats: 'sheetmetal' });
    }

    // rooftop details with count badges
    var pen = s.penetrations || {};
    var icons = [
      ['pipe', pen.pipe, 'Pipe penetrations'],
      ['curb', pen.curb, 'Equipment curbs'],
      ['hvac', pen.hvac, 'HVAC units'],
      ['skylight', pen.skylight, 'Skylights'],
      ['drain', s.drains, 'Roof drains'],
      ['scupper', s.scuppers, 'Scuppers']
    ].filter(function (ic) { return ic[1] > 0; });
    icons.forEach(function (ic, i) {
      var x = 150 + i * 80;
      if (x > R - 40) return;
      var body = '';
      if (ic[0] === 'pipe') body = '<rect x="' + (x - 5) + '" y="' + (top - 22) + '" width="10" height="22"/><ellipse cx="' + x + '" cy="' + (top - 22) + '" rx="5" ry="2.5"/>';
      else if (ic[0] === 'hvac' || ic[0] === 'curb') body = '<rect x="' + (x - 15) + '" y="' + (top - 18) + '" width="30" height="18" rx="2"/>';
      else if (ic[0] === 'skylight') body = '<polygon points="' + (x - 14) + ',' + top + ' ' + (x - 8) + ',' + (top - 14) + ' ' + (x + 8) + ',' + (top - 14) + ' ' + (x + 14) + ',' + top + '"/>';
      else body = '<circle cx="' + x + '" cy="' + (top + 3) + '" r="7"/><line x1="' + (x - 5) + '" y1="' + (top + 3) + '" x2="' + (x + 5) + '" y2="' + (top + 3) + '"/>';
      svg += '<g class="pv-el pv-icon" data-pvname="' + esc(ic[2] + ' × ' + ic[1]) + '" data-pvcats="details" tabindex="0">' +
        body + countBadge(x + 14, top - 22, ic[1]) + '</g>';
    });

    // dimensions line
    var tpl = s.templateKey && allTemplates()[s.templateKey];
    svg += '<text x="' + ((L + R) / 2) + '" y="266" class="pv-dim" text-anchor="middle">' +
      qty(s.fieldSquares || 0) + ' squares &middot; ' + qty(s.perimeterLF || 0) + ' LF perimeter &middot; ' +
      esc(s.scope) + (tpl ? ' &middot; ' + esc(tpl.label) : '') + '</text>';

    // skip the DOM swap (and the hover/focus reset it causes) when unchanged
    if (svgEl._last !== svg) {
      svgEl._last = svg;
      lastPvEl = null;
      svgEl.innerHTML = '<svg viewBox="0 0 660 276" role="img" aria-label="Roof assembly cross-section">' + svg + '</svg>';
    }
  }

  var lastPvEl = null; // pointerover fires per child crossed — render once per element

  function showPreviewDetail(el) {
    if (el === lastPvEl) return;
    lastPvEl = el;
    var detail = $('preview-detail');
    if (!detail) return;
    var name = el.dataset.pvname || '';
    var cats = (el.dataset.pvcats || '').split(',').filter(Boolean);
    var sku = el.dataset.pvsku;
    var secId = App.estimate.sections[App.ui.previewSec || 0].id;
    var secRes = ((App.lastResult || {}).sections || []).filter(function (x) { return x.id === secId; })[0];
    var lines = ((secRes || {}).lines || []).filter(function (l) {
      return sku ? l.sku === sku : cats.indexOf(l.category) >= 0;
    });
    var html = '<strong>' + esc(name) + '</strong>';
    if (lines.length) {
      html += lines.map(function (l) {
        return '<span class="pv-line">' + esc(l.desc) + ' — ' + qty(l.qty) + ' ' + esc(l.unit) +
          ' · mat ' + money(l.matTotal) + ' · labor ' + money(l.laborTotal) + '</span>';
      }).join('');
    } else {
      html += '<span class="pv-line muted">No cost lines yet for this element.</span>';
    }
    detail.innerHTML = html;
  }

  function wirePreview() {
    var svgEl = $('preview-svg');
    if (!svgEl) return;
    ['pointerover', 'click', 'focusin'].forEach(function (ev) {
      svgEl.addEventListener(ev, function (e) {
        var el = e.target.closest ? e.target.closest('.pv-el') : null;
        if (el) showPreviewDetail(el);
      });
    });
  }

  /* ---------- catalog editor (schema-driven) ---------- */

  function renderCatalog() {
    var h = '';
    (typeof KRE_CATALOG_SCHEMA !== 'undefined' ? KRE_CATALOG_SCHEMA : []).forEach(function (group) {
      h += '<div class="cat-group"><h3>' + esc(group.title) + '</h3>';
      if (group.kind === 'fields') {
        h += '<div class="cat-fieldset">' + group.fields.map(function (f) {
          var v = getPath(App.catalog, f.path);
          return '<div class="field"><label>' + esc(f.label) + (f.unit ? ' <span class="muted">(' + esc(f.unit) + ')</span>' : '') + '</label>' +
            '<input type="number" inputmode="decimal" data-type="num" data-scope="catalog" data-path="' + f.path + '"' +
            (f.step ? ' step="' + f.step + '"' : ' step="0.01"') + ' value="' + val(v) + '">' +
            '</div>';
        }).join('') + '</div>';
      } else if (group.kind === 'table') {
        var rows = getPath(App.catalog, group.path) || {};
        h += '<div class="table-scroll"><table class="cat-table"><thead><tr>' +
          group.columns.map(function (c) { return '<th>' + esc(c.label || c.key) + '</th>'; }).join('') +
          (group.canAddRows ? '<th></th>' : '') + '</tr></thead><tbody>';
        Object.keys(rows).forEach(function (key) {
          h += '<tr>';
          group.columns.forEach(function (c) {
            var p = group.path + '.' + key + '.' + c.key;
            var v = rows[key][c.key];
            h += '<td><input type="' + (c.type === 'str' ? 'text' : 'number') + '"' +
              (c.type === 'str' ? '' : ' inputmode="decimal" data-type="num"' + (c.step ? ' step="' + c.step + '"' : ' step="0.01"')) +
              ' data-scope="catalog" data-path="' + p + '" value="' + esc(val(v)) + '"></td>';
          });
          if (group.canAddRows) {
            h += '<td><button type="button" class="icon-btn danger" data-action="cat-del-row" data-cat-path="' +
              group.path + '" data-key="' + esc(key) + '" title="Delete row">&times;</button></td>';
          }
          h += '</tr>';
        });
        h += '</tbody></table></div>';
        if (group.canAddRows) {
          h += '<button type="button" class="btn btn-ghost btn-sm" data-action="cat-add-row" data-cat-path="' + group.path + '">+ Add row</button>';
        }
      }
      h += '</div>';
    });
    $('catalog-body').innerHTML = h;
  }

  function updateSampleBadges() {
    var pill = $('sample-pill');
    var banner = $('catalog-banner');
    if (pill) pill.hidden = App.customized;
    if (banner) banner.hidden = App.customized;
  }

  /* ---------- saved estimates ---------- */

  function renderSaved() {
    var list = KRE.storage.listEstimates();
    $('saved-body').innerHTML = list.length ?
      '<div class="table-scroll"><table class="saved-table"><thead><tr><th>Name</th><th>Project</th><th>Saved</th>' +
      '<th class="num">Total</th><th></th></tr></thead><tbody>' +
      list.map(function (e) {
        var d = e.savedAt ? new Date(e.savedAt).toLocaleDateString() : '';
        return '<tr><td>' + esc(e.name) + '</td><td>' + esc((e.estimate.project || {}).name || '') + '</td>' +
          '<td>' + esc(d) + '</td><td class="num">' + money(e.grandTotal || 0) + '</td><td class="row-actions">' +
          ['load', 'dup', 'del', 'exp'].map(function (act) {
            var lbl = { load: 'Load', dup: 'Duplicate', del: 'Delete', exp: 'Export' }[act];
            return '<button type="button" class="btn btn-ghost btn-sm" data-action="est-' + act + '" data-id="' + esc(e.id) + '">' + lbl + '</button>';
          }).join('') + '</td></tr>';
      }).join('') + '</tbody></table></div>' :
      '<p class="saved-empty">No saved estimates yet. Use “Save estimate” in the header.</p>';
  }

  /* ---------- tabs ---------- */

  function switchTab(name) {
    ['estimate', 'catalog', 'saved'].forEach(function (t) {
      var panel = $('tab-' + t);
      if (panel) panel.hidden = t !== name;
    });
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === name);
    });
    App.ui.tab = name;
    KRE.storage.saveUI(App.ui);
    if (name === 'saved') renderSaved();
  }

  function renderEstimateForm() {
    fillStatic();
    renderAssembly();
    renderSections();
    scheduleResults();
  }

  /* ---------- events ---------- */

  function onValueEvent(e) {
    var el = e.target;
    if (el.dataset.action === 'sec-template' && e.type === 'change') {
      setSectionTemplate(App.estimate.sections[parseInt(el.dataset.i, 10)], el.value || null);
      renderSections();
      afterEstimateChange();
      return;
    }
    if (el.dataset.action === 'toggle-tapered') {
      App.estimate.assembly.tapered = el.checked ? { avgThicknessIn: 1.5, designFee: 0 } : null;
      renderAssembly();
      afterEstimateChange();
      return;
    }
    var path = el.dataset.path;
    if (!path) return;
    if (el.type === 'radio' && !el.checked) return;
    var isCatalog = el.dataset.scope === 'catalog';
    setPath(isCatalog ? App.catalog : App.estimate, path, coerce(el));
    if (isCatalog) {
      scheduleResults();
      return;
    }
    if (path.indexOf('assembly.attachment.zoneSplit') === 0) updateZoneSum();
    if (e.type === 'change' && el.dataset.struct === 'assembly') renderAssembly();
    if (e.type === 'change' && el.dataset.struct === 'sections') renderSections();
    afterEstimateChange();
  }

  function afterEstimateChange() {
    scheduleResults();
    KRE.storage.autosaveDraft(App.estimate);
  }

  function onClick(e) {
    var btn = e.target.closest('[data-action],[data-tab]');
    if (!btn) {
      // clicking a section header (not one of its controls) toggles collapse
      var head = e.target.closest('.sc-head');
      if (head && !e.target.closest('input,button,select,textarea,label')) {
        var card = head.closest('.sec-card');
        var sid = card.dataset.secId;
        App.ui.collapsed[sid] = !App.ui.collapsed[sid];
        KRE.storage.saveUI(App.ui);
        card.classList.toggle('collapsed');
      }
      return;
    }
    if (btn.dataset.tab) { switchTab(btn.dataset.tab); return; }
    var act = btn.dataset.action;
    var est = App.estimate;

    switch (act) {
      case 'toggle-tapered': return; // handled on change
      case 'add-layer': {
        var flat = Object.keys(App.catalog.insulations || {}).filter(function (k) {
          return App.catalog.insulations[k].pricing !== 'perInchSqft';
        });
        est.assembly.insulationLayers.push({ productKey: flat[0] || '' });
        renderAssembly(); afterEstimateChange(); break;
      }
      case 'rm-layer':
        est.assembly.insulationLayers.splice(parseInt(btn.dataset.i, 10), 1);
        renderAssembly(); afterEstimateChange(); break;
      case 'add-section':
        est.sections.push(newSectionObj());
        renderSections(); afterEstimateChange(); break;
      case 'dup-section': {
        var src = clone(est.sections[parseInt(btn.dataset.i, 10)]);
        src.id = 'sx' + Date.now().toString(36) + (secCounter++);
        src.name += ' (copy)';
        est.sections.splice(parseInt(btn.dataset.i, 10) + 1, 0, src);
        renderSections(); afterEstimateChange(); break;
      }
      case 'rm-section':
        if (est.sections.length <= 1) { alert('An estimate needs at least one section.'); break; }
        if (!confirm('Remove this section?')) break;
        est.sections.splice(parseInt(btn.dataset.i, 10), 1);
        renderSections(); afterEstimateChange(); break;
      case 'cat-add-row': {
        var name = prompt('Name for the new item:');
        if (!name) break;
        var tbl = getPath(App.catalog, btn.dataset.catPath) || {};
        var key = uniqueSlug(name, tbl, 'item');
        var firstKey = Object.keys(tbl)[0];
        var row = firstKey ? clone(tbl[firstKey]) : {};
        Object.keys(row).forEach(function (k) { if (typeof row[k] === 'number') row[k] = 0; });
        row.label = name;
        tbl[key] = row;
        setPath(App.catalog, btn.dataset.catPath, tbl);
        renderCatalog(); scheduleResults(); break;
      }
      case 'cat-del-row': {
        if (!confirm('Delete this row? Estimates referencing it will show an error.')) break;
        var t2 = getPath(App.catalog, btn.dataset.catPath);
        delete t2[btn.dataset.key];
        renderCatalog(); scheduleResults(); break;
      }
      default:
        handleAppAction(act, btn);
    }
  }

  function handleAppAction(act, btn) {
    var est = App.estimate;
    switch (act) {
      case 'new-est':
        if (!confirm('Start a new estimate? The current draft will be replaced.')) break;
        App.estimate = KRE.engine.newEstimate(App.catalog);
        KRE.storage.clearDraft();
        renderEstimateForm(); switchTab('estimate'); break;
      case 'save-est': {
        var name = prompt('Save estimate as:', (est.project.name || 'Untitled'));
        if (!name) break;
        if (!est.id) est.id = 'est-' + Date.now().toString(36);
        KRE.storage.saveEstimate({
          id: est.id, name: name, savedAt: new Date().toISOString(),
          grandTotal: (App.lastResult && App.lastResult.totals.grandTotal) || 0,
          estimate: clone(est)
        });
        flash(btn, 'Saved ✓'); renderSaved(); break;
      }
      case 'export-est':
        KRE.storage.exportJSON(est, 'estimate-' + (est.project.name || 'untitled').replace(/\s+/g, '-').toLowerCase() + '.json');
        break;
      case 'print-internal':
        renderResults();
        KRE.print.printInternal(est, App.lastResult, App.catalog, { sample: !App.customized });
        break;
      case 'print-proposal':
        if (!App.customized && !confirm('The catalog still uses SAMPLE rates — this total is NOT a real price. Print the proposal anyway?')) break;
        renderResults();
        KRE.print.printProposal(est, App.lastResult, App.catalog);
        break;
      case 'cat-save':
        KRE.storage.saveCatalog(App.catalog);
        App.customized = true;
        updateSampleBadges(); flash(btn, 'Saved ✓'); break;
      case 'cat-reset': {
        if (!confirm('Reset ALL rates to the shipped SAMPLE placeholders? Your edits will be lost.')) break;
        KRE.storage.resetCatalog();
        var loaded = KRE.storage.loadCatalog(KRE_DEFAULT_CATALOG);
        App.catalog = loaded.catalog; App.customized = false;
        renderCatalog(); renderAssembly(); updateSampleBadges(); scheduleResults(); break;
      }
      case 'cat-export': {
        // fold user templates into the export so systems travel with the rates
        var exp = clone(App.catalog);
        exp.systemTemplates = Object.assign({}, exp.systemTemplates, App.userTemplates);
        KRE.storage.exportJSON(exp, 'kodiak-catalog-' + new Date().toISOString().slice(0, 10) + '.json');
        break;
      }
      case 'cat-import': $('file-cat').click(); break;
      case 'est-import-btn': $('file-est').click(); break;
      case 'results-close': $('results').classList.remove('open'); break;
      case 'pv-tab':
        App.ui.previewSec = parseInt(btn.dataset.i, 10);
        KRE.storage.saveUI(App.ui);
        renderPreview();
        break;
      case 'tpl-apply': {
        var tkey = ($('tpl-select') || {}).value;
        var tpl = tkey && allTemplates()[tkey];
        if (!tpl) { alert('Pick a template first.'); break; }
        App.estimate.assembly = KRE.storage.deepMerge(App.estimate.assembly, tpl.assembly);
        renderAssembly(); afterEstimateChange(); break;
      }
      case 'tpl-save': {
        var tname = prompt('Template name (e.g. "TPO 60-mil — Mechanically Attached"):');
        if (!tname) break;
        var slug = uniqueSlug(tname, allTemplates(), 'template');
        App.userTemplates[slug] = { label: tname, assembly: assemblySnapshot() };
        KRE.storage.saveTemplates(App.userTemplates);
        renderAssembly(); renderSections();
        break;
      }
      case 'tpl-delete': {
        var dkey = ($('tpl-select') || {}).value;
        if (!dkey) { alert('Pick a template first.'); break; }
        if (!App.userTemplates[dkey]) {
          alert('That is a built-in template — only templates you saved can be deleted.');
          break;
        }
        if (!confirm('Delete template "' + (allTemplates()[dkey].label || dkey) + '"?')) break;
        delete App.userTemplates[dkey];
        KRE.storage.saveTemplates(App.userTemplates);
        App.estimate.sections.forEach(function (sc) {
          if (sc.templateKey === dkey) setSectionTemplate(sc, null);
        });
        renderAssembly(); renderSections(); afterEstimateChange();
        break;
      }
      case 'import-apply': applyImport(); break;
      case 'import-dismiss':
        App.pendingImport = null;
        $('import-review').hidden = true;
        $('import-review').innerHTML = '';
        break;
      case 'est-load': case 'est-dup': case 'est-del': case 'est-exp': {
        var entry = KRE.storage.getEstimate(btn.dataset.id);
        if (!entry) break;
        if (act === 'est-load') {
          App.estimate = clone(entry.estimate);
          renderEstimateForm(); switchTab('estimate');
          KRE.storage.autosaveDraft(App.estimate);
        } else if (act === 'est-dup') {
          var cp = clone(entry);
          cp.id = 'est-' + Date.now().toString(36);
          cp.name += ' (copy)';
          cp.estimate.id = cp.id;
          KRE.storage.saveEstimate(cp); renderSaved();
        } else if (act === 'est-del') {
          if (confirm('Delete "' + entry.name + '"?')) { KRE.storage.deleteEstimate(entry.id); renderSaved(); }
        } else {
          KRE.storage.exportJSON(entry.estimate, 'estimate-' + entry.name.replace(/\s+/g, '-').toLowerCase() + '.json');
        }
        break;
      }
    }
  }

  function wireEvents() {
    document.addEventListener('input', onValueEvent);
    document.addEventListener('change', onValueEvent);
    document.addEventListener('click', onClick);

    var map = {
      'btn-new-est': 'new-est', 'btn-save-est': 'save-est',
      'btn-add-section': 'add-section',
      'btn-print-internal': 'print-internal', 'btn-print-proposal': 'print-proposal',
      'btn-export-est': 'export-est',
      'btn-cat-save': 'cat-save', 'btn-cat-reset': 'cat-reset',
      'btn-cat-export': 'cat-export', 'btn-cat-import': 'cat-import',
      'btn-est-import': 'est-import-btn', 'btn-results-close': 'results-close'
    };
    Object.keys(map).forEach(function (id) {
      var el = $(id);
      if (el && !el.dataset.action) el.dataset.action = map[id];
    });

    var fileCat = $('file-cat');
    if (fileCat) fileCat.addEventListener('change', function () {
      var f = fileCat.files[0];
      if (!f) return;
      KRE.storage.importJSONFile(f, 'catalog').then(function (obj) {
        App.catalog = KRE.storage.deepMerge(KRE_DEFAULT_CATALOG, obj);
        KRE.storage.saveCatalog(App.catalog);
        App.customized = true;
        renderCatalog(); renderAssembly(); updateSampleBadges(); scheduleResults();
      }).catch(function (err) { alert('Import failed: ' + err); });
      fileCat.value = '';
    });

    var fileEst = $('file-est');
    if (fileEst) fileEst.addEventListener('change', function () {
      var f = fileEst.files[0];
      if (!f) return;
      KRE.storage.importJSONFile(f, 'estimate').then(function (obj) {
        App.estimate = obj;
        renderEstimateForm(); switchTab('estimate');
        KRE.storage.autosaveDraft(App.estimate);
      }).catch(function (err) { alert('Import failed: ' + err); });
      fileEst.value = '';
    });

    var mob = $('mobile-summary');
    if (mob) mob.addEventListener('click', function () {
      $('results').classList.add('open');
    });
  }

  /* ---------- file import (dropzone at top of Estimate tab) ---------- */

  var IMPORT_SECTION_FIELDS = [
    // [extract key, estimate path within section, label]
    ['fieldSquares', 'fieldSquares', 'Field area (squares)'],
    ['perimeterLF', 'perimeterLF', 'Perimeter LF'],
    ['edgeLf', 'edgeMetal.lf', 'Edge metal LF'],
    ['flashLf', 'wallFlash.lf', 'Wall/curb flashing LF'],
    ['flashHeightFt', 'wallFlash.avgHeightFt', 'Flashing height ft'],
    ['pipe', 'penetrations.pipe', 'Pipes'],
    ['curb', 'penetrations.curb', 'Curbs'],
    ['skylight', 'penetrations.skylight', 'Skylights'],
    ['hvac', 'penetrations.hvac', 'HVAC units'],
    ['drains', 'drains', 'Drains'],
    ['scuppers', 'scuppers', 'Scuppers'],
    ['existingLayers', 'existingLayers', 'Existing layers']
  ];
  var IMPORT_PROJECT_LABELS = {
    name: 'Project name', customer: 'Customer', address: 'Address', city: 'City',
    state: 'State', estimator: 'Estimator', stories: 'Stories', craneDays: 'Crane days', notes: 'Notes'
  };

  function handleImportFile(file) {
    if (!file) return;
    var review = $('import-review');
    review.hidden = false;
    review.innerHTML = '<p class="muted">Reading ' + esc(file.name) + '…</p>';
    KRE.importer.parseFile(file).then(function (result) {
      if (result.kind === 'estimate') {
        review.hidden = true;
        if (confirm('Load the estimate from "' + result.sourceName + '"? The current draft will be replaced.')) {
          App.estimate = result.estimate;
          renderEstimateForm();
          KRE.storage.autosaveDraft(App.estimate);
        }
        return;
      }
      if (result.kind === 'catalog') {
        review.hidden = true;
        if (confirm('"' + result.sourceName + '" is a CATALOG (rates) file. Import it and use these rates?')) {
          App.catalog = KRE.storage.deepMerge(KRE_DEFAULT_CATALOG, result.catalog);
          KRE.storage.saveCatalog(App.catalog);
          App.customized = true;
          renderCatalog(); renderAssembly(); updateSampleBadges(); scheduleResults();
        }
        return;
      }
      renderImportReview(result);
    }).catch(function (err) {
      review.hidden = false;
      review.innerHTML = '<div class="liability-note">Import failed: ' + esc(err.message || err) + '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="import-dismiss">Dismiss</button>';
    });
  }

  function renderImportReview(result) {
    var ex = result.extract || { project: {}, sections: [], notes: [] };
    var review = $('import-review');
    var rows = '';

    Object.keys(ex.project).forEach(function (k) {
      if (ex.project[k] == null || ex.project[k] === '') return;
      rows += '<tr><td>' + esc(IMPORT_PROJECT_LABELS[k] || k) + '</td><td>' + esc(ex.project[k]) + '</td></tr>';
    });
    ex.sections.forEach(function (s, i) {
      rows += '<tr class="group-row"><td colspan="2">Section: ' + esc(s.name || ('Section ' + (i + 1))) +
        (s.scope ? ' <span class="muted">(' + esc(s.scope) + ')</span>' : '') + '</td></tr>';
      IMPORT_SECTION_FIELDS.forEach(function (f) {
        if (s[f[0]] == null) return;
        rows += '<tr><td>' + esc(f[2]) + '</td><td class="num">' + esc(s[f[0]]) + '</td></tr>';
      });
    });

    if (!rows) {
      review.hidden = false;
      review.innerHTML = '<div class="liability-note">Nothing usable was found in "' + esc(result.sourceName) + '". ' +
        (ex.notes.length ? esc(ex.notes.join(' ')) : 'Try the CSV template, or an estimate JSON export.') + '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="import-dismiss">Dismiss</button>';
      return;
    }

    App.pendingImport = ex;
    review.hidden = false;
    review.innerHTML =
      '<p class="mini-note">Found in <strong>' + esc(result.sourceName) + '</strong> — review, then apply:</p>' +
      '<div class="table-scroll"><table class="cat-table"><tbody>' + rows + '</tbody></table></div>' +
      (ex.notes.length ? '<p class="mini-note">' + esc(ex.notes.join(' · ')) + '</p>' : '') +
      '<div class="res-actions">' +
      '<button type="button" class="btn btn-red btn-sm" data-action="import-apply">Apply to estimate</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="import-dismiss">Dismiss</button>' +
      '</div>';
  }

  function applyImport() {
    var ex = App.pendingImport;
    if (!ex) return;
    Object.keys(ex.project).forEach(function (k) {
      var v = ex.project[k];
      if (v != null && v !== '' && k in App.estimate.project) App.estimate.project[k] = v;
    });
    if (ex.sections.length) {
      var hasData = App.estimate.sections.some(function (s) { return (s.fieldSquares || 0) > 0; });
      if (!hasData || confirm('Replace the current ' + App.estimate.sections.length +
        ' section(s) with the ' + ex.sections.length + ' imported one(s)?')) {
        App.estimate.sections = ex.sections.map(function (src, i) {
          var sec = newSectionObj();
          sec.name = src.name || ('Section ' + (i + 1));
          if (src.scope) sec.scope = src.scope;
          IMPORT_SECTION_FIELDS.forEach(function (f) {
            if (src[f[0]] != null) setPath(sec, f[1], src[f[0]]);
          });
          return sec;
        });
      }
    }
    App.pendingImport = null;
    $('import-review').hidden = true;
    $('import-review').innerHTML = '';
    renderEstimateForm();
    KRE.storage.autosaveDraft(App.estimate);
  }

  function wireImport() {
    var dz = $('dropzone'), fi = $('file-import'), tpl = $('csv-template-link');
    if (!dz || !fi) return;
    dz.addEventListener('click', function () { fi.click(); });
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    ['dragover', 'dragenter'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleImportFile(f);
    });
    fi.addEventListener('change', function () { handleImportFile(fi.files[0]); fi.value = ''; });
    if (tpl) tpl.addEventListener('click', function (e) {
      e.preventDefault();
      var blob = new Blob([KRE.importer.csvTemplate()], { type: 'text/csv' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kodiak-takeoff-template.csv';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
  }

  /* ---------- boot ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    var loaded = KRE.storage.loadCatalog(KRE_DEFAULT_CATALOG);
    App.catalog = loaded.catalog;
    App.customized = loaded.customized;
    App.estimate = KRE.storage.loadDraft() || KRE.engine.newEstimate(App.catalog);
    App.userTemplates = KRE.storage.loadTemplates();
    App.ui = KRE.storage.loadUI() || {};
    App.ui.collapsed = App.ui.collapsed || {};

    renderEstimateForm();
    renderCatalog();
    renderSaved();
    updateSampleBadges();
    wireEvents();
    wireImport();
    wirePreview();
    switchTab(App.ui.tab || 'estimate');
  });
})();
