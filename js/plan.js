/* Kodiak Roofing Estimator — bird's-eye 3D roof view.
   Pure string builder (DOM-free, node-testable): projects each roof section
   as an orthographic 3D slab — parapets at flashing height, rooftop details,
   membrane color from the section's resolved assembly — into one SVG. The UI
   layer owns the container, drag state (yaw/tilt), and hover details; every
   face carries the same data-pv* attributes as the cross-section preview. */

(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v, f) { return typeof v === 'number' && isFinite(v) ? v : f; }
  function r1(v) { return Math.round(v * 10) / 10; }

  var MEMBRANE_FILLS = { tpo: '#e9e9e9', pvc: '#cdd9e5', epdm: '#4a4a4a' };
  var SLAB_H = 1.5;      // visual slab thickness, ft
  var MAX_ICONS = 6;     // drawn per detail type; true count stays in the label

  /* Rectangle l×w (l ≥ w) from a section's area (sqft) and perimeter (LF).
     No real solution (perimeter too short for the area) → square fallback. */
  function rectDims(areaSqft, perimLf) {
    var A = Math.max(num(areaSqft, 0), 1);
    if (num(perimLf, 0) > 0) {
      var s = perimLf / 2, disc = s * s - 4 * A;
      if (disc >= 0) {
        var l = (s + Math.sqrt(disc)) / 2, w = (s - Math.sqrt(disc)) / 2;
        if (w > 0) {
          if (l / w > 8) { l = Math.sqrt(A * 8); w = A / l; } // cap aspect for readability
          return { l: l, w: w };
        }
      }
    }
    var side = Math.sqrt(A);
    return { l: side, w: side };
  }

  /* Orthographic projector. tilt 0 = straight-down bird's eye; tilt grows
     toward a side view. Returns screen x/y plus d (depth toward the camera,
     larger = closer = drawn later). */
  function makeProj(yawDeg, tiltDeg) {
    var ya = yawDeg * Math.PI / 180, ta = tiltDeg * Math.PI / 180;
    var cy = Math.cos(ya), sy = Math.sin(ya), ct = Math.cos(ta), st = Math.sin(ta);
    return function (x, y, z) {
      var u = x * cy - y * sy, v = x * sy + y * cy;
      return { x: u, y: v * ct - z * st, d: v * st + z * ct };
    };
  }

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    var g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    var b = Math.min(255, Math.round((n & 255) * f));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* Axis-aligned box → 6 quads with per-face brightness (top lightest, sides
     shaded by their yaw-rotated normal against a fixed light direction). */
  function boxFaces(faces, cx, cy, z0, w, d, h, color, pv, yawDeg) {
    var x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2, z1 = z0 + h;
    var ya = yawDeg * Math.PI / 180, cyw = Math.cos(ya), syw = Math.sin(ya);
    var LX = 0.55, LY = -0.83; // light direction in screen-plane
    function sideBright(nx, ny) {
      var rx = nx * cyw - ny * syw, ry = nx * syw + ny * cyw;
      return 0.62 + 0.3 * Math.max(0, rx * LX + ry * LY);
    }
    var quads = [
      { pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], f: 1.0 },          // top
      { pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], f: sideBright(0, -1) },
      { pts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], f: sideBright(1, 0) },
      { pts: [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], f: sideBright(0, 1) },
      { pts: [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], f: sideBright(-1, 0) }
    ];
    if (z0 > 0.01) quads.push({ pts: [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]], f: 0.5 });
    quads.forEach(function (q) {
      faces.push({ pts: q.pts, fill: shade(color, q.f), pv: pv });
    });
  }

  /* Deterministic grid placement of rooftop items inside a section slab. */
  function placeItems(items, l, w) {
    var margin = Math.min(6, l / 5, w / 5);
    var n = items.length;
    if (!n) return [];
    var cols = Math.max(1, Math.round(Math.sqrt(n * (l / w))));
    var rows = Math.ceil(n / cols);
    return items.map(function (it, i) {
      var cxi = (i % cols + 0.5) / cols, cyi = (Math.floor(i / cols) + 0.5) / rows;
      it.x = -l / 2 + margin + cxi * (l - 2 * margin);
      it.y = -w / 2 + margin + cyi * (w - 2 * margin);
      return it;
    });
  }

  var DETAIL_SPECS = {
    hvac:     { w: 6, d: 6, h: 4,    color: '#c1c7ce', label: 'HVAC units' },
    curb:     { w: 4, d: 4, h: 1.5,  color: '#c1c7ce', label: 'Equipment curbs' },
    skylight: { w: 4, d: 4, h: 1.5,  color: '#dfe8f0', label: 'Skylights' },
    pipe:     { w: 0.9, d: 0.9, h: 2.6, color: '#8f979f', label: 'Pipe penetrations' },
    drain:    { w: 2.2, d: 2.2, h: 0.15, color: '#4a5560', label: 'Roof drains' }
  };

  function build(estimate, catalog, result, view) {
    var yaw = num(view && view.yaw, 0), tilt = num(view && view.tilt, 0);
    var proj = makeProj(yaw, tilt);
    var faces = [], labels = [];
    var GAP = 14; // ft between section slabs

    var secs = (estimate.sections || []).filter(function (s) { return num(s.fieldSquares, 0) > 0; });
    if (!secs.length) {
      return '<svg viewBox="0 0 660 200"><text x="330" y="100" class="pv-dim" text-anchor="middle">' +
        'Enter a section area to draw the roof.</text></svg>';
    }

    // lay slabs left→right, centered as a group on the origin
    var dims = secs.map(function (s) { return rectDims(num(s.fieldSquares, 0) * 100, s.perimeterLF); });
    var totalL = dims.reduce(function (t, d) { return t + d.l; }, 0) + GAP * (secs.length - 1);
    var xCursor = -totalL / 2;

    secs.forEach(function (s, si) {
      var d = dims[si];
      var cx = xCursor + d.l / 2;
      xCursor += d.l + GAP;

      var secRes = ((result || {}).sections || []).filter(function (x) { return x.id === s.id; })[0];
      var asm = (secRes && secRes.assembly) || estimate.assembly || {};
      var mem = ((catalog || {}).membranes || {})[asm.membraneKey];
      var memFill = MEMBRANE_FILLS[mem ? mem.type : 'tpo'] || '#e9e9e9';
      var secName = s.name || 'Section ' + (si + 1);

      // slab
      boxFaces(faces, cx, 0, 0, d.l, d.w, SLAB_H, memFill,
        { name: secName + ' — ' + (mem ? mem.label : 'membrane not selected') + ', ' +
          r1(d.l) + '×' + r1(d.w) + ' ft', cats: 'membrane', sec: s.id }, yaw);

      // parapet walls (only where flashing exists), edge-metal cap on top
      var pH = (s.wallFlash && s.wallFlash.lf > 0) ? Math.max(1, num(s.wallFlash.avgHeightFt, 1)) : 0;
      if (pH > 0) {
        var t = 1.0, z0 = SLAB_H;
        var wallPv = { name: secName + ' — parapet & flashing (' + r1(pH) + ' ft)', cats: 'flashings', sec: s.id };
        boxFaces(faces, cx, -d.w / 2 + t / 2, z0, d.l, t, pH, '#d9d4cb', wallPv, yaw);
        boxFaces(faces, cx, d.w / 2 - t / 2, z0, d.l, t, pH, '#d9d4cb', wallPv, yaw);
        boxFaces(faces, cx - d.l / 2 + t / 2, 0, z0, t, d.w - 2 * t, pH, '#d9d4cb', wallPv, yaw);
        boxFaces(faces, cx + d.l / 2 - t / 2, 0, z0, t, d.w - 2 * t, pH, '#d9d4cb', wallPv, yaw);
        if (s.edgeMetal && s.edgeMetal.lf > 0) {
          var capPv = { name: secName + ' — ' + s.edgeMetal.type + ' cap, ' + r1(s.edgeMetal.lf) + ' LF', cats: 'sheetmetal', sec: s.id };
          boxFaces(faces, cx, -d.w / 2 + t / 2, z0 + pH, d.l + 0.6, t + 0.6, 0.3, '#8f979f', capPv, yaw);
          boxFaces(faces, cx, d.w / 2 - t / 2, z0 + pH, d.l + 0.6, t + 0.6, 0.3, '#8f979f', capPv, yaw);
        }
      }

      // rooftop details, capped per type; true counts live in the hover label
      var pen = s.penetrations || {};
      var items = [];
      [['hvac', pen.hvac], ['curb', pen.curb], ['skylight', pen.skylight],
       ['pipe', pen.pipe], ['drain', s.drains]].forEach(function (dt) {
        var count = num(dt[1], 0);
        if (count <= 0) return;
        var spec = DETAIL_SPECS[dt[0]];
        var shown = Math.min(count, MAX_ICONS);
        for (var i = 0; i < shown; i++) {
          items.push({
            spec: spec,
            pv: { name: secName + ' — ' + spec.label + ' × ' + count +
              (count > shown ? ' (' + shown + ' drawn)' : ''), cats: 'details', sec: s.id }
          });
        }
      });
      placeItems(items, d.l, d.w).forEach(function (it) {
        boxFaces(faces, cx + it.x, it.y, SLAB_H, it.spec.w, it.spec.d, it.spec.h, it.spec.color, it.pv, yaw);
      });

      labels.push({ x: cx, y: 0, z: SLAB_H + pH + 6, text: secName });
    });

    // project, painter-sort (far first), emit
    var out = faces.map(function (f) {
      var depth = 0;
      var pts = f.pts.map(function (p) {
        var q = proj(p[0], p[1], p[2]);
        depth += q.d;
        return q;
      });
      return { pts: pts, depth: depth / f.pts.length, fill: f.fill, pv: f.pv };
    }).sort(function (a, b) { return a.depth - b.depth; });

    // stable framing: bound by the group's world radius so rotating never rescales
    var maxZ = SLAB_H + 10;
    var radius = Math.sqrt(Math.pow(totalL / 2, 2) + Math.pow(Math.max.apply(null, dims.map(function (d) { return d.w / 2; })), 2) + maxZ * maxZ) * 1.12;
    var vbY = radius * 0.72; // roofs are wide — trim vertical framing

    var svg = out.map(function (f) {
      var pts = f.pts.map(function (p) { return r1(p.x) + ',' + r1(p.y); }).join(' ');
      return '<polygon points="' + pts + '" fill="' + f.fill + '" class="pv-el pv-plan"' +
        ' data-pvname="' + esc(f.pv.name) + '" data-pvcats="' + f.pv.cats + '"' +
        ' data-pvsec="' + esc(f.pv.sec) + '" tabindex="0"/>';
    }).join('');

    svg += labels.map(function (lb) {
      var q = proj(lb.x, lb.y, lb.z);
      return '<text x="' + r1(q.x) + '" y="' + r1(q.y) + '" class="pv-dim" text-anchor="middle">' + esc(lb.text) + '</text>';
    }).join('');

    return '<svg viewBox="' + r1(-radius) + ' ' + r1(-vbY) + ' ' + r1(radius * 2) + ' ' + r1(vbY * 2) +
      '" role="img" aria-label="Bird\'s-eye roof view">' + svg + '</svg>';
  }

  var api = { build: build, rectDims: rectDims, makeProj: makeProj };
  if (typeof window !== 'undefined') { window.KRE = window.KRE || {}; window.KRE.plan = api; }
  if (typeof module !== 'undefined') module.exports = api;
})();
