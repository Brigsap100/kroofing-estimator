/* =========================================================================
 * Kodiak Roofing Estimator — storage.js
 * Persistence layer: localStorage wrapper, schema migrations, JSON export/import.
 *
 * Classic script (no modules). Attaches to window.KRE.storage in the browser
 * and module.exports in node. DOM-free except exportJSON / importJSONFile,
 * which are guarded so require()'ing this file in node never crashes.
 *
 * localStorage keys:
 *   kre.catalog     — user-edited catalog (deep-merged over shipped defaults)
 *   kre.draft       — autosaved in-progress estimate (500ms debounce)
 *   kre.estimates   — array of saved-estimate entries
 *   kre.ui          — UI prefs (last tab etc.)
 *   kre.backup.<ts> — raw copy of any object with an unknown schemaVersion
 * ========================================================================= */
(function () {
  'use strict';

  var CURRENT_SCHEMA_VERSION = 1;

  var KEY_CATALOG = 'kre.catalog';
  var KEY_DRAFT = 'kre.draft';
  var KEY_ESTIMATES = 'kre.estimates';
  var KEY_UI = 'kre.ui';
  var KEY_TEMPLATES = 'kre.templates';
  var KEY_BACKUP_PREFIX = 'kre.backup.';

  /* ------------------------------------------------------------------ *
   * Storage backend (injectable; window.localStorage by default,
   * in-memory shim otherwise — so this module also loads/runs in node).
   * ------------------------------------------------------------------ */

  function createMemoryStorage() {
    var data = {};
    return {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
      },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = {}; },
      key: function (i) { return Object.keys(data)[i] != null ? Object.keys(data)[i] : null; },
      get length() { return Object.keys(data).length; },
      _keys: function () { return Object.keys(data); } // convenience for self-check
    };
  }

  var backend = null;

  function resolveDefaultBackend() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Probe: localStorage can throw in some privacy modes.
        window.localStorage.getItem('kre.__probe__');
        return window.localStorage;
      }
    } catch (e) {
      warn('localStorage unavailable, falling back to in-memory storage', e);
    }
    return createMemoryStorage();
  }

  function getBackend() {
    if (!backend) backend = resolveDefaultBackend();
    return backend;
  }

  /** Inject a storage backend ({getItem,setItem,removeItem}); null resets to default. */
  function setBackend(storageLike) {
    backend = storageLike || null;
  }

  function warn(msg, err) {
    try {
      if (typeof console !== 'undefined' && console.warn) {
        if (err !== undefined) console.warn('[KRE.storage] ' + msg, err);
        else console.warn('[KRE.storage] ' + msg);
      }
    } catch (e) { /* never throw from a warning */ }
  }

  /* ------------------------------------------------------------------ *
   * Guarded JSON read/write — quota errors / corrupt JSON never
   * propagate to callers; they get null/defaults instead.
   * ------------------------------------------------------------------ */

  function readJSON(key) {
    var raw;
    try {
      raw = getBackend().getItem(key);
    } catch (e) {
      warn('read failed for "' + key + '"', e);
      return null;
    }
    if (raw == null || raw === '') return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      warn('corrupt JSON in "' + key + '" — ignoring stored value', e);
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      getBackend().setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      warn('write failed for "' + key + '" (quota or serialization)', e);
      return false;
    }
  }

  function removeKey(key) {
    try {
      getBackend().removeItem(key);
      return true;
    } catch (e) {
      warn('remove failed for "' + key + '"', e);
      return false;
    }
  }

  /* ------------------------------------------------------------------ *
   * deepMerge / deepClone
   * ------------------------------------------------------------------ */

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v) &&
      Object.prototype.toString.call(v) === '[object Object]';
  }

  function deepClone(v) {
    if (Array.isArray(v)) {
      var arr = [];
      for (var i = 0; i < v.length; i++) arr[i] = deepClone(v[i]);
      return arr;
    }
    if (isPlainObject(v)) {
      var obj = {};
      for (var k in v) {
        if (Object.prototype.hasOwnProperty.call(v, k)) obj[k] = deepClone(v[k]);
      }
      return obj;
    }
    return v; // primitives, null, functions, Dates etc. returned as-is
  }

  /**
   * Recursively merge `override` onto `base` for plain objects only.
   * Arrays and non-object values are replaced wholesale.
   * Never mutates either input; always returns a fresh structure.
   */
  function deepMerge(base, override) {
    if (override === undefined) return deepClone(base);
    if (!isPlainObject(base) || !isPlainObject(override)) return deepClone(override);
    var out = {};
    var k;
    for (k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = deepClone(base[k]);
    }
    for (k in override) {
      if (!Object.prototype.hasOwnProperty.call(override, k)) continue;
      if (isPlainObject(out[k]) && isPlainObject(override[k])) {
        out[k] = deepMerge(out[k], override[k]);
      } else {
        out[k] = deepClone(override[k]);
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Migrations — forward-only chain. schemaVersion 1 is current, so the
   * chain is empty, but the plumbing exists so v2+ only adds a case.
   * ------------------------------------------------------------------ */

  function backupRaw(obj) {
    var key = KEY_BACKUP_PREFIX + Date.now();
    // avoid clobbering if two backups land in the same millisecond
    try {
      var n = 0;
      while (getBackend().getItem(key) != null && n < 10) {
        n++;
        key = KEY_BACKUP_PREFIX + Date.now() + '-' + n;
      }
    } catch (e) { /* probing failed; just write */ }
    writeJSON(key, obj);
    return key;
  }

  /**
   * Migrate a stored object ('catalog' | 'estimate') to the current schema.
   * Unknown or missing schemaVersion → raw copy stored under kre.backup.<ts>,
   * then the object is returned best-effort (deepMerge over defaults and the
   * engine's validation act as the safety net). Never throws.
   */
  function migrate(obj, kind) {
    if (!isPlainObject(obj)) return obj;

    var v = obj.schemaVersion;
    if (v == null && isPlainObject(obj.meta)) v = obj.meta.schemaVersion;

    if (typeof v !== 'number' || v < 1 || v > CURRENT_SCHEMA_VERSION || v !== Math.floor(v)) {
      warn('unknown schemaVersion (' + v + ') on ' + (kind || 'object') +
        ' — raw backup saved, continuing best-effort');
      backupRaw(obj);
      return obj;
    }

    /* Forward-only fall-through chain. Each case upgrades one version and
     * falls through to the next. v1 is current, so there is nothing to do.
     *
     * Example for a future bump:
     *   case 1:
     *     obj = migrateCatalogV1toV2(obj, kind);
     *     // falls through
     */
    switch (v) { // eslint-disable-line default-case
      case CURRENT_SCHEMA_VERSION:
        break;
    }
    return obj;
  }

  /* ------------------------------------------------------------------ *
   * Catalog
   * ------------------------------------------------------------------ */

  /**
   * Load the working catalog.
   * @returns {{catalog: Object, customized: boolean}}
   *  - nothing saved → deep clone of defaults, customized:false
   *  - saved → migrated, deep-merged over defaults (so new default fields
   *    never clobber user edits, and new fields still appear)
   */
  function loadCatalog(defaults) {
    var saved = readJSON(KEY_CATALOG);
    if (!isPlainObject(saved)) {
      return { catalog: deepClone(defaults), customized: false };
    }
    saved = migrate(saved, 'catalog');
    var merged = deepMerge(defaults, saved);
    var customized = !!(isPlainObject(saved.meta) && saved.meta.customized);
    return { catalog: merged, customized: customized };
  }

  /** Persist the catalog; stamps meta.customized=true and meta.savedAt (ISO). */
  function saveCatalog(catalog) {
    if (!isPlainObject(catalog)) {
      warn('saveCatalog: expected an object, got ' + typeof catalog);
      return false;
    }
    if (!isPlainObject(catalog.meta)) catalog.meta = {};
    catalog.meta.customized = true;
    catalog.meta.savedAt = new Date().toISOString();
    if (catalog.meta.schemaVersion == null) catalog.meta.schemaVersion = CURRENT_SCHEMA_VERSION;
    return writeJSON(KEY_CATALOG, catalog);
  }

  /** Remove the saved catalog (back to shipped SAMPLE defaults on next load). */
  function resetCatalog() {
    return removeKey(KEY_CATALOG);
  }

  /* ------------------------------------------------------------------ *
   * Draft estimate (autosave)
   * ------------------------------------------------------------------ */

  var draftTimer = null;
  var DRAFT_DEBOUNCE_MS = 500;

  /** @returns migrated estimate object, or null if none / unreadable. */
  function loadDraft() {
    var saved = readJSON(KEY_DRAFT);
    if (!isPlainObject(saved)) return null;
    return migrate(saved, 'estimate');
  }

  /** Debounced (500ms) autosave of the in-progress estimate to kre.draft. */
  function autosaveDraft(estimate) {
    if (draftTimer !== null) clearTimeout(draftTimer);
    // Snapshot now so later mutations before the timer fires aren't half-saved.
    var snapshot = deepClone(estimate);
    draftTimer = setTimeout(function () {
      draftTimer = null;
      writeJSON(KEY_DRAFT, snapshot);
    }, DRAFT_DEBOUNCE_MS);
    if (draftTimer && typeof draftTimer.unref === 'function') draftTimer.unref();
  }

  /** Cancel any pending autosave and remove the stored draft. */
  function clearDraft() {
    if (draftTimer !== null) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
    return removeKey(KEY_DRAFT);
  }

  /* ------------------------------------------------------------------ *
   * Saved estimates — array of {id, name, savedAt, grandTotal, estimate}
   * ------------------------------------------------------------------ */

  function readEstimatesArray() {
    var arr = readJSON(KEY_ESTIMATES);
    return Array.isArray(arr) ? arr : [];
  }

  /** @returns entries sorted newest-first by savedAt. */
  function listEstimates() {
    var arr = readEstimatesArray().filter(isPlainObject);
    arr.sort(function (a, b) {
      var sa = typeof a.savedAt === 'string' ? a.savedAt : '';
      var sb = typeof b.savedAt === 'string' ? b.savedAt : '';
      if (sa === sb) return 0;
      return sa < sb ? 1 : -1; // ISO strings compare lexicographically
    });
    return arr;
  }

  /**
   * Upsert a saved-estimate entry by entry.id.
   * Expected shape: {id, name, savedAt?, grandTotal, estimate}.
   * savedAt is stamped (ISO) if the caller didn't provide one.
   */
  function saveEstimate(entry) {
    if (!isPlainObject(entry) || entry.id == null || entry.id === '') {
      warn('saveEstimate: entry must be an object with an id');
      return false;
    }
    var stored = deepClone(entry);
    if (typeof stored.savedAt !== 'string' || !stored.savedAt) {
      stored.savedAt = new Date().toISOString();
    }
    var arr = readEstimatesArray();
    var replaced = false;
    for (var i = 0; i < arr.length; i++) {
      if (isPlainObject(arr[i]) && arr[i].id === stored.id) {
        arr[i] = stored;
        replaced = true;
        break;
      }
    }
    if (!replaced) arr.push(stored);
    return writeJSON(KEY_ESTIMATES, arr);
  }

  /** @returns the saved entry {id,name,savedAt,grandTotal,estimate} or null. */
  function getEstimate(id) {
    var arr = readEstimatesArray();
    for (var i = 0; i < arr.length; i++) {
      if (isPlainObject(arr[i]) && arr[i].id === id) return arr[i];
    }
    return null;
  }

  function deleteEstimate(id) {
    var arr = readEstimatesArray();
    var kept = arr.filter(function (e) { return !(isPlainObject(e) && e.id === id); });
    if (kept.length === arr.length) return false; // nothing removed
    return writeJSON(KEY_ESTIMATES, kept);
  }

  /* ------------------------------------------------------------------ *
   * UI prefs (last tab etc.) — always failure-tolerant
   * ------------------------------------------------------------------ */

  function loadUI() {
    var saved = readJSON(KEY_UI);
    return isPlainObject(saved) ? saved : {};
  }

  /** User-saved system templates ({key: {label, assembly}}) — real data, so
      it gets its own key with a schemaVersion and a migrate() pass (unlike
      UI prefs), and survives a catalog reset. */
  function loadTemplates() {
    var saved = readJSON(KEY_TEMPLATES);
    if (!isPlainObject(saved)) return {};
    saved = migrate(saved, 'templates');
    return isPlainObject(saved.items) ? saved.items : {};
  }

  function saveTemplates(items) {
    return writeJSON(KEY_TEMPLATES, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: isPlainObject(items) ? items : {}
    });
  }

  function saveUI(obj) {
    if (!isPlainObject(obj)) return false;
    return writeJSON(KEY_UI, obj);
  }

  /* ------------------------------------------------------------------ *
   * JSON file export / import (browser only — guarded for node)
   * ------------------------------------------------------------------ */

  /** Download `obj` as a JSON file via a temporary anchor click. */
  function exportJSON(obj, filename) {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
      warn('exportJSON is only available in the browser');
      return false;
    }
    try {
      var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || 'kodiak-estimator.json';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
      return true;
    } catch (e) {
      warn('exportJSON failed', e);
      return false;
    }
  }

  /**
   * Read a File (from <input type=file>), parse as JSON, run migrations.
   * @param {File} file
   * @param {string} [kind] 'catalog' | 'estimate' (passed through to migrate)
   * @returns {Promise<Object>} resolves parsed+migrated object;
   *          rejects with an Error carrying a readable message.
   */
  function importJSONFile(file, kind) {
    return new Promise(function (resolve, reject) {
      if (typeof FileReader === 'undefined') {
        reject(new Error('File import is only available in the browser.'));
        return;
      }
      if (!file) {
        reject(new Error('No file selected.'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error('Could not read "' + (file.name || 'file') + '". Please try again.'));
      };
      reader.onload = function () {
        var parsed;
        try {
          parsed = JSON.parse(String(reader.result));
        } catch (e) {
          reject(new Error('"' + (file.name || 'file') + '" is not valid JSON (' + e.message + ').'));
          return;
        }
        if (!isPlainObject(parsed)) {
          reject(new Error('"' + (file.name || 'file') + '" does not contain a JSON object.'));
          return;
        }
        resolve(migrate(parsed, kind));
      };
      reader.readAsText(file);
    });
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  var api = {
    CURRENT_SCHEMA_VERSION: CURRENT_SCHEMA_VERSION,

    deepMerge: deepMerge,
    deepClone: deepClone,

    loadCatalog: loadCatalog,
    saveCatalog: saveCatalog,
    resetCatalog: resetCatalog,

    loadDraft: loadDraft,
    autosaveDraft: autosaveDraft,
    clearDraft: clearDraft,

    listEstimates: listEstimates,
    saveEstimate: saveEstimate,
    deleteEstimate: deleteEstimate,
    getEstimate: getEstimate,

    loadUI: loadUI,
    saveUI: saveUI,
    loadTemplates: loadTemplates,
    saveTemplates: saveTemplates,

    migrate: migrate,

    exportJSON: exportJSON,
    importJSONFile: importJSONFile,

    // backend injection (node tests, private-mode fallback)
    setBackend: setBackend,
    createMemoryStorage: createMemoryStorage
  };

  if (typeof window !== 'undefined') {
    window.KRE = window.KRE || {};
    window.KRE.storage = api;
  }
  if (typeof module !== 'undefined') module.exports = api;

  /* ------------------------------------------------------------------ *
   * Self-check: `node js/storage.js` exercises the core paths.
   * Not a substitute for tests/ (owned by the engine agent).
   * ------------------------------------------------------------------ */
  if (typeof module !== 'undefined' && typeof require !== 'undefined' && require.main === module) {
    (function selfCheck() {
      var failures = 0;
      function check(name, cond) {
        if (cond) {
          console.log('PASS  ' + name);
        } else {
          failures++;
          console.log('FAIL  ' + name);
        }
      }

      var mem = createMemoryStorage();
      setBackend(mem);

      /* ---- deepMerge ---- */
      var base = { a: 1, nest: { x: 1, y: 2 }, arr: [1, 2, 3], keep: 'k' };
      var over = { a: 9, nest: { y: 20, z: 30 }, arr: [7] };
      var merged = deepMerge(base, over);
      check('deepMerge: nested objects merged recursively',
        merged.a === 9 && merged.nest.x === 1 && merged.nest.y === 20 &&
        merged.nest.z === 30 && merged.keep === 'k');
      check('deepMerge: arrays replaced wholesale',
        merged.arr.length === 1 && merged.arr[0] === 7);
      check('deepMerge: inputs not mutated',
        base.a === 1 && base.nest.y === 2 && base.arr.length === 3 &&
        over.nest.x === undefined);
      merged.nest.x = 99;
      merged.arr.push(8);
      check('deepMerge: result shares no references with inputs',
        base.nest.x === 1 && over.arr.length === 1);
      check('deepMerge: non-object override replaces wholesale',
        deepMerge({ a: 1 }, 5) === 5 && deepMerge(3, { b: 2 }).b === 2);

      /* ---- catalog round-trip ---- */
      var defaults = {
        labor: { baseRate: 1, prevailingMult: 1.5 },
        membranes: { 'tpo-60': { costPerSquare: 100 } },
        newDefaultField: 'ships-later',
        meta: { schemaVersion: 1, customized: false }
      };
      var fresh = loadCatalog(defaults);
      check('loadCatalog: absent → clone of defaults, customized:false',
        fresh.customized === false &&
        fresh.catalog.labor.baseRate === 1 &&
        fresh.catalog !== defaults &&
        fresh.catalog.labor !== defaults.labor);

      fresh.catalog.labor.baseRate = 42;
      var savedOk = saveCatalog(fresh.catalog);
      check('saveCatalog: writes and stamps meta',
        savedOk === true &&
        fresh.catalog.meta.customized === true &&
        typeof fresh.catalog.meta.savedAt === 'string');

      var reloaded = loadCatalog(defaults);
      check('loadCatalog: saved edits merged over defaults, customized:true',
        reloaded.customized === true &&
        reloaded.catalog.labor.baseRate === 42 &&
        reloaded.catalog.labor.prevailingMult === 1.5 &&
        reloaded.catalog.newDefaultField === 'ships-later');

      resetCatalog();
      check('resetCatalog: back to defaults, customized:false',
        loadCatalog(defaults).customized === false &&
        loadCatalog(defaults).catalog.labor.baseRate === 1);

      /* ---- estimates upsert / list / get / delete ---- */
      saveEstimate({ id: 'e1', name: 'First', savedAt: '2026-08-01T10:00:00.000Z', grandTotal: 100, estimate: { schemaVersion: 1, n: 1 } });
      saveEstimate({ id: 'e2', name: 'Second', savedAt: '2026-08-02T10:00:00.000Z', grandTotal: 200, estimate: { schemaVersion: 1, n: 2 } });
      var list = listEstimates();
      check('saveEstimate/listEstimates: two entries, newest first',
        list.length === 2 && list[0].id === 'e2' && list[1].id === 'e1');

      saveEstimate({ id: 'e1', name: 'First v2', savedAt: '2026-08-03T10:00:00.000Z', grandTotal: 150, estimate: { schemaVersion: 1, n: 3 } });
      list = listEstimates();
      check('saveEstimate: upsert by id (no duplicate, updated, re-sorted)',
        list.length === 2 && list[0].id === 'e1' &&
        list[0].name === 'First v2' && list[0].grandTotal === 150);

      var got = getEstimate('e2');
      check('getEstimate: returns full entry',
        !!got && got.name === 'Second' && got.estimate.n === 2);
      check('getEstimate: unknown id → null', getEstimate('nope') === null);

      deleteEstimate('e2');
      check('deleteEstimate: removes entry',
        listEstimates().length === 1 && getEstimate('e2') === null);

      var stamped = saveEstimate({ id: 'e3', name: 'No date', grandTotal: 0, estimate: {} });
      check('saveEstimate: stamps savedAt when missing',
        stamped === true && typeof getEstimate('e3').savedAt === 'string');

      /* ---- UI prefs ---- */
      saveUI({ tab: 'catalog' });
      check('saveUI/loadUI round-trip', loadUI().tab === 'catalog');

      saveTemplates({ 'my-tpo': { label: 'My TPO', assembly: { membraneKey: 'tpo-60' } } });
      check('saveTemplates/loadTemplates round-trip',
        loadTemplates()['my-tpo'].assembly.membraneKey === 'tpo-60');
      check('loadTemplates: nothing stored → {}',
        (function () { removeKey(KEY_TEMPLATES); var t = loadTemplates(); return isPlainObject(t) && Object.keys(t).length === 0; })());
      mem.removeItem('kre.ui');
      check('loadUI: nothing stored → {}',
        isPlainObject(loadUI()) && Object.keys(loadUI()).length === 0);

      /* ---- migrate: unknown version → backup + best-effort ---- */
      var weird = { schemaVersion: 99, foo: 'bar' };
      var out = migrate(weird, 'estimate');
      var backupKeys = mem._keys().filter(function (k) { return k.indexOf('kre.backup.') === 0; });
      check('migrate: unknown version returns object best-effort', out === weird);
      check('migrate: unknown version stores raw backup', backupKeys.length === 1 &&
        JSON.parse(mem.getItem(backupKeys[0])).foo === 'bar');
      check('migrate: current version passes through untouched',
        migrate({ schemaVersion: 1, ok: true }, 'estimate').ok === true &&
        mem._keys().filter(function (k) { return k.indexOf('kre.backup.') === 0; }).length === 1);

      /* ---- corrupt JSON tolerated ---- */
      mem.setItem('kre.catalog', '{not json');
      check('readJSON: corrupt stored catalog → defaults, no throw',
        loadCatalog(defaults).customized === false);

      /* ---- draft autosave (async, 500ms debounce) ---- */
      autosaveDraft({ schemaVersion: 1, v: 'stale' });
      autosaveDraft({ schemaVersion: 1, v: 'latest' }); // supersedes the first
      check('autosaveDraft: nothing written before debounce fires',
        loadDraft() === null);

      setTimeout(function () {
        var draft = loadDraft();
        check('autosaveDraft: debounced write landed with latest value',
          !!draft && draft.v === 'latest');
        clearDraft();
        check('clearDraft: draft removed', loadDraft() === null);

        console.log(failures === 0
          ? '\nAll storage self-checks passed.'
          : '\n' + failures + ' storage self-check(s) FAILED.');
        process.exit(failures === 0 ? 0 : 1);
      }, 650);
    })();
  }
})();
