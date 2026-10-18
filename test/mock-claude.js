// In-page mock of window.claude.use(): an in-memory db with live snapshots, a canned sample(), no downloads/mcp.
// Injected by smoke.js after window.__SEED (path -> data) is set. Every write is logged in window.__writes.
(function () {
  var store = new Map();
  Object.keys(window.__SEED || {}).forEach(function (k) { store.set(k, JSON.parse(JSON.stringify(window.__SEED[k]))); });
  var listeners = [];
  window.__writes = [];
  window.__failNext = 0; // set >0 to make the next N writes reject with "unavailable"

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function docSnap(path) {
    var v = store.get(path);
    return { id: path.split('/').pop(), exists: v !== undefined, data: function () { return clone(v); } };
  }
  function colSnap(name) {
    var docs = [];
    store.forEach(function (v, k) {
      var segs = k.split('/');
      if (segs.length === name.split('/').length + 1 && k.indexOf(name + '/') === 0) docs.push({ id: segs.pop(), data: function () { return clone(v); } });
    });
    return { docs: docs, size: docs.length };
  }
  function notify() {
    setTimeout(function () { listeners.forEach(function (l) { l(); }); }, 5);
  }
  function write(op, path, data) {
    return new Promise(function (res, rej) {
      setTimeout(function () {
        if (window.__failNext > 0) { window.__failNext--; var e = new Error('unavailable'); e.code = 'unavailable'; rej(e); return; }
        window.__writes.push({ op: op, path: path });
        if (op === 'delete') store.delete(path);
        else if (op === 'update') store.set(path, Object.assign(store.get(path) || {}, clone(data)));
        else store.set(path, clone(data));
        notify();
        res({ version: String(Date.now()) });
      }, 8);
    });
  }
  function doc(path) {
    return {
      get: function () { return Promise.resolve(docSnap(path)); },
      set: function (d) { return write('set', path, d); },
      update: function (d) { return write('update', path, d); },
      delete: function () { return write('delete', path); },
      onSnapshot: function (cb) {
        var l = function () { cb(docSnap(path)); };
        listeners.push(l);
        setTimeout(l, 10);
        return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
      }
    };
  }
  function collection(name) {
    var q = {
      doc: function (id) { return doc(name + '/' + id); },
      orderBy: function () { return q; },
      limit: function () { return q; },
      where: function () { return q; },
      get: function () { return Promise.resolve(colSnap(name)); },
      onSnapshot: function (cb) {
        var l = function () { cb(colSnap(name)); };
        listeners.push(l);
        setTimeout(l, 20);
        return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
      }
    };
    return q;
  }
  var db = { doc: doc, collection: collection };

  var sample = function () { return Promise.resolve({ text: '{}' }); };
  sample.limits = function () { return Promise.resolve({ images: true }); };
  sample.json = function (prompt) {
    if (/short German name/.test(prompt)) return Promise.resolve({ meal_name: 'Testmahlzeit' });
    return Promise.resolve({
      items: [{ line: 0, name: 'Testbrot', qty: 100, unit: 'g', unit_g: 1, kcal: 250, protein: 8, carbs: 45, fat: 3, sugar: 4, salt: 1.1, potassium: 200, gi: 60, brand: null, estimate: false, bls: null }],
      questions: [], meal_name: 'Testmahlzeit', note: 'Testnotiz.'
    });
  };

  window.claude = {
    use: function (name) {
      return new Promise(function (res) {
        setTimeout(function () { res(name === 'db' ? db : name === 'sample' ? sample : null); }, 30);
      });
    }
  };
  window.__store = store;
})();
