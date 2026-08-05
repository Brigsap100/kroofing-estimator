# Kodiak Roofing — Single-Ply Estimator

Internal estimating tool for commercial single-ply roofing (TPO / EPDM / PVC) at
Kodiak Roofing & Waterproofing. Models the roof as a layered assembly
(deck → vapor retarder → insulation → tapered → cover board → membrane → attachment),
takes quantities per roof section, and prices the takeoff into line items, a
material order list, and internal / client-proposal printouts.

Plain static HTML/CSS/JS — no framework, no build step, no backend. All data
stays in the browser (localStorage) with JSON export/import.

## ⚠️ Rates are SAMPLE placeholders

Every price and labor production rate the app ships with is a **placeholder,
not a real Kodiak cost**. Until you enter real rates on the **Catalog & Rates**
tab and press *Save catalog*, the app shows a SAMPLE RATES pill, banners the
catalog, watermarks internal printouts, and warns before printing a proposal.
Nothing in this repo contains real business numbers — your rates live only in
your browser's localStorage (and in JSON files you export).

## ⚠️ Wind-uplift fastening densities

Fastening densities (field / perimeter / corner, for insulation and membrane)
are **never defaulted** — they start empty and the estimate shows an error
until you enter values from a manufacturer-approved assembly (FM RoofNav
number, manufacturer letter, etc.). Record that reference in the
"Manufacturer-approved assembly reference" field; it prints on the proposal.
An explicit `0` is valid (loose-laid/ballasted); blank is not.

## Import from file

The card at the top of the Estimate tab accepts a dropped/browsed file:

- **Estimate JSON** (exported by this app) — loads the whole estimate exactly.
- **Catalog JSON** — detected automatically and routed to the rates import.
- **CSV / TSV / Excel (.xlsx)** — takeoff sheets. Download the template from
  the link under the drop-zone; header names are matched loosely (e.g.
  "Client", "Area SqFt", "Roof Drains", "RTUs" all work; sq ft auto-converts
  to squares). `.xlsx` is read with the browser's built-in decompressor — no
  libraries; old `.xls` must be re-saved as `.xlsx`/`.csv`.
- **PDF measurement reports** — best-effort text extraction and
  pattern-matching (area, perimeter, parapet LF, drains, penetrations…).
  Works on text-based PDFs only, not scans.

Nothing is applied silently: extracted values appear in a review panel and
only land in the estimate when you press **Apply** (replacing sections asks
first if the current ones have data).

## Run

```bash
python3 -m http.server 4173 --bind 127.0.0.1
# open http://127.0.0.1:4173
```

## Verify

```bash
for f in js/*.js tests/*.js; do node --check "$f" || exit 1; done  # syntax
node tests/engine.test.js   # calc engine against hand-computed fixtures
node js/storage.js          # storage layer self-check
```

Manual checklist after UI changes:

- Typing in any field updates the results panel without losing focus
- Add / duplicate / remove sections; collapse via the section header
- Switching attachment method shows the right panel; density inputs start
  empty with the liability note
- Catalog: edit → *Save catalog* clears the SAMPLE banner; *Reset to defaults*
  restores it; export/import round-trips
- Draft survives a reload; Save/Load/Delete on the Saved tab
- Both print previews (US Letter); internal printout watermarked while on
  sample rates
- 375 px-wide phone: bottom summary bar expands to the results sheet
- Clean boot with localStorage cleared

## Structure

| File | Role |
|---|---|
| `index.html` | Single page, 3 tabs (Estimate / Catalog & Rates / Saved). ID contract documented in the top comment. |
| `css/app.css` | Kodiak light theme (matches the marketing site) + one `@media print` block. |
| `js/catalog.defaults.js` | `KRE_DEFAULT_CATALOG` (sample data) + `KRE_CATALOG_SCHEMA` (drives the catalog editor). DOM-free. |
| `js/engine.js` | Pure calc: `computeEstimate(estimate, catalog)`. DOM-free, node-testable. |
| `js/storage.js` | localStorage persistence, migrations, JSON export/import. |
| `js/print.js` | Builds the internal breakdown / client proposal into `#print-root`. |
| `js/ui.js` | State, data-path binding, all renderers. Only file with event listeners. |
| `tests/` | `TEST_CATALOG` + hand-computed fixtures, run with plain `node`. |

Script load order matters: catalog.defaults → engine → storage → print → ui.

## Deploy

Push to `main`. Note: GitHub Pages on a **private** repo requires a paid plan —
the tool runs fine locally either way, and no real rates ever live in the repo,
so making the repo public is also safe.
