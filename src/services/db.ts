// Minimal promise-based IndexedDB wrapper.
const DB_NAME = 'khatib-ceh';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('attempts')) db.createObjectStore('attempts', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const kv = {
  get: <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  set: (key: string, value: unknown) => tx('kv', 'readwrite', (s) => s.put(value, key)),
  del: (key: string) => tx('kv', 'readwrite', (s) => s.delete(key)),
};

export interface StoredAttempt<T> {
  id: string;
  data: T;
  synced: boolean; // written to the JSON folder
  cloudSynced?: boolean; // uploaded to the cloud database
  fileName?: string;
}

export const attemptsStore = {
  all: <T>() => tx<StoredAttempt<T>[]>('attempts', 'readonly', (s) => s.getAll() as IDBRequest<StoredAttempt<T>[]>),
  put: <T>(rec: StoredAttempt<T>) => tx('attempts', 'readwrite', (s) => s.put(rec)),
};
