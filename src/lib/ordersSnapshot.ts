// Last full order list saved in this browser (IndexedDB), so a page reload can
// show orders at once and then fetch only what changed. Every call is
// best-effort: without IndexedDB (private mode, blocked storage, tests) reads
// return null and writes do nothing.

const DB_NAME = "merchant-suite";
const STORE = "orders-snapshot";
const KEY = "orders";
// Bump when the saved shape changes; older snapshots are then ignored.
const SNAPSHOT_VERSION = 1;
// Older snapshots are dropped rather than shown.
export const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60_000;

export interface OrdersSnapshot<T> {
  version: number;
  userId: string;
  orders: T[];
  totalCount: number;
  syncedAt: string;
  // When the list was last loaded in full (Date.now()), for the 30-minute full refresh.
  fullAt: number;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function run<R>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<R>): Promise<R | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** The saved list for this user, or null when missing, stale, or from another user/version. */
export async function loadOrdersSnapshot<T>(userId: string): Promise<OrdersSnapshot<T> | null> {
  const snapshot = (await run("readonly", (store) => store.get(KEY))) as OrdersSnapshot<T> | null | undefined;
  if (!snapshot) return null;
  const valid = snapshot.version === SNAPSHOT_VERSION
    && snapshot.userId === userId
    && Array.isArray(snapshot.orders)
    && typeof snapshot.syncedAt === "string"
    && Date.now() - snapshot.savedAt < SNAPSHOT_MAX_AGE_MS;
  if (!valid) {
    void clearOrdersSnapshot();
    return null;
  }
  return snapshot;
}

export async function saveOrdersSnapshot<T>(snapshot: Omit<OrdersSnapshot<T>, "version" | "savedAt">): Promise<void> {
  await run("readwrite", (store) => store.put({ ...snapshot, version: SNAPSHOT_VERSION, savedAt: Date.now() }, KEY));
}

export async function clearOrdersSnapshot(): Promise<void> {
  await run("readwrite", (store) => store.delete(KEY));
}
