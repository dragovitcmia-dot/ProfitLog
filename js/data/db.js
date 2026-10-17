// Storage adapters. IndexedDB is the real store; if it is unavailable (some
// private modes, blocked storage) we fall back to localStorage, and as a last
// resort to memory so the app still works for the current session.
//
// Every adapter has the same async interface:
//   kind                      'indexeddb' | 'localstorage' | 'memory'
//   loadAll()                 -> { sales, settings }
//   putSales(sales)           upsert by id
//   deleteSales(ids)
//   clearSales()
//   saveSettings(settings)
//   clearAll()

const DB_NAME = 'profitlog';
const DB_VERSION = 1;
const OPEN_TIMEOUT_MS = 4000;

export async function openStorage() {
  try {
    return await openIndexedDB();
  } catch (err) {
    console.warn('IndexedDB unavailable, falling back to localStorage', err);
  }
  try {
    return openLocalStorage();
  } catch (err) {
    console.warn('localStorage unavailable, using memory only', err);
  }
  return openMemory();
}

// ---------------------------------------------------------------------------
// IndexedDB

const wrap = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No indexedDB'));
    const timer = setTimeout(() => reject(new Error('indexedDB open timed out')), OPEN_TIMEOUT_MS);
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      clearTimeout(timer);
      return reject(e);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sales')) db.createObjectStore('sales', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
    req.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('indexedDB blocked'));
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(indexedDBAdapter(db));
    };
  });
}

function indexedDBAdapter(db) {
  return {
    kind: 'indexeddb',
    async loadAll() {
      const tx = db.transaction(['sales', 'meta'], 'readonly');
      const salesReq = tx.objectStore('sales').getAll();
      const metaReq = tx.objectStore('meta').get('settings');
      await done(tx);
      return { sales: salesReq.result || [], settings: metaReq.result ? metaReq.result.value : null };
    },
    async putSales(sales) {
      if (!sales.length) return;
      const tx = db.transaction('sales', 'readwrite');
      const store = tx.objectStore('sales');
      for (const s of sales) store.put(s);
      await done(tx);
    },
    async deleteSales(ids) {
      if (!ids.length) return;
      const tx = db.transaction('sales', 'readwrite');
      const store = tx.objectStore('sales');
      for (const id of ids) store.delete(id);
      await done(tx);
    },
    async clearSales() {
      const tx = db.transaction('sales', 'readwrite');
      tx.objectStore('sales').clear();
      await done(tx);
    },
    async saveSettings(settings) {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key: 'settings', value: settings });
      await done(tx);
    },
    async clearAll() {
      const tx = db.transaction(['sales', 'meta'], 'readwrite');
      tx.objectStore('sales').clear();
      tx.objectStore('meta').clear();
      await done(tx);
    },
  };
}

// ---------------------------------------------------------------------------
// localStorage (whole collection stored as one JSON array)

const LS_SALES = 'profitlog.sales';
const LS_SETTINGS = 'profitlog.settings';

function openLocalStorage() {
  const ls = globalThis.localStorage;
  ls.setItem('profitlog.probe', '1'); // throws when storage is blocked or full
  ls.removeItem('profitlog.probe');
  const read = () => {
    try {
      const v = JSON.parse(ls.getItem(LS_SALES) || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  let cache = new Map(read().map((s) => [s.id, s]));
  const flush = () => ls.setItem(LS_SALES, JSON.stringify([...cache.values()]));
  return {
    kind: 'localstorage',
    async loadAll() {
      let settings = null;
      try {
        settings = JSON.parse(ls.getItem(LS_SETTINGS) || 'null');
      } catch {
        /* ignore */
      }
      return { sales: [...cache.values()], settings };
    },
    async putSales(sales) {
      for (const s of sales) cache.set(s.id, s);
      flush();
    },
    async deleteSales(ids) {
      for (const id of ids) cache.delete(id);
      flush();
    },
    async clearSales() {
      cache = new Map();
      flush();
    },
    async saveSettings(settings) {
      ls.setItem(LS_SETTINGS, JSON.stringify(settings));
    },
    async clearAll() {
      cache = new Map();
      ls.removeItem(LS_SALES);
      ls.removeItem(LS_SETTINGS);
    },
  };
}

// ---------------------------------------------------------------------------
// Memory (nothing survives a reload)

export function openMemory() {
  let sales = new Map();
  let settings = null;
  return {
    kind: 'memory',
    async loadAll() {
      return { sales: [...sales.values()], settings };
    },
    async putSales(list) {
      for (const s of list) sales.set(s.id, s);
    },
    async deleteSales(ids) {
      for (const id of ids) sales.delete(id);
    },
    async clearSales() {
      sales = new Map();
    },
    async saveSettings(next) {
      settings = next;
    },
    async clearAll() {
      sales = new Map();
      settings = null;
    },
  };
}
