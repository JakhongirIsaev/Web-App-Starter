/* ─────────────────────────────────────────────────────────────
 * Phase D1 — IndexedDB-backed offline queue.
 *
 * Markets in Tashkent regions have spotty data. When the mini-app
 * detects offline, it queues the new-client + quick-lead saves to
 * this store instead of failing. On reconnect, sync-runner drains
 * the queue.
 *
 * Each queued item carries a UUID that doubles as a hint for any
 * future server-side dedup via clients.external_uuid. As of this
 * commit the server does NOT consume that hint, so a queued POST
 * that actually succeeded on the server but never returned an HTTP
 * response could be replayed and create a duplicate. Acceptable
 * trade-off for v1 — duplicates are rare in practice and easier to
 * merge later than to lose a lead capture in the field.
 *
 * Photo uploads (FileReader → /storage/uploads/direct) are NOT
 * queued — they need separate handling and were ruled out of scope
 * for D1.
 * ──────────────────────────────────────────────────────────── */

const DB_NAME = "minerva-offline";
const STORE = "queue";
const VERSION = 1;

export interface QueuedSave {
  uuid: string;       // crypto.randomUUID() — also the queue key
  endpoint: string;   // e.g. "/mini-app/clients"
  body: unknown;      // JSON-serializable
  createdAt: number;  // epoch ms
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "uuid" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(
  item: Omit<QueuedSave, "uuid" | "createdAt">,
): Promise<string> {
  const uuid = crypto.randomUUID();
  const queued: QueuedSave = { ...item, uuid, createdAt: Date.now() };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(queued);
    tx.oncomplete = () => resolve(uuid);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueued(): Promise<QueuedSave[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedSave[]);
    req.onerror = () => reject(req.error);
  });
}

export async function dequeue(uuid: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(uuid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function queueSize(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
