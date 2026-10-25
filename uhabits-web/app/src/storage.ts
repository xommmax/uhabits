// Keeps the SQLite database file in IndexedDB, so it survives app restarts.

const DB_NAME = "loop-habits";
const STORE = "files";
const KEY = "uhabits.db";

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadDatabase(): Promise<Uint8Array | null> {
  return (await run<Uint8Array | undefined>("readonly", (s) => s.get(KEY))) ?? null;
}

export async function saveDatabase(bytes: Uint8Array): Promise<void> {
  await run("readwrite", (s) => s.put(bytes, KEY));
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
