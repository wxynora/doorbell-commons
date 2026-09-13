export interface StandingImage { residentId: string; revision: number; image: string | null }
const images = new Map<string, StandingImage>();
let database: Promise<IDBDatabase | null> | undefined;
function openDatabase(): Promise<IDBDatabase | null> {
  if (!database) database = new Promise(resolve => {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    const request = indexedDB.open("doorbell-standing-images", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images", { keyPath: "residentId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return database;
}
export async function readStandingImage(residentId: string, revision: number): Promise<StandingImage | null> {
  const remembered = images.get(residentId);
  if (remembered?.revision === revision) return remembered;
  const db = await openDatabase();
  if (!db) return null;
  const value = await new Promise<StandingImage | undefined>(resolve => {
    const request = db.transaction("images").objectStore("images").get(residentId);
    request.onsuccess = () => resolve(request.result as StandingImage | undefined);
    request.onerror = () => resolve(undefined);
  });
  if (value?.revision !== revision) return null;
  images.set(residentId, value);
  return value;
}
export async function saveStandingImage(value: StandingImage): Promise<void> {
  images.set(value.residentId, value);
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>(resolve => {
    const transaction = db.transaction("images", "readwrite");
    transaction.objectStore("images").put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}
