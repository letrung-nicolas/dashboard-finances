import { StorageError } from './types';
import type { RawRecord } from './types';

export const META = 'meta';
export const RECORDS = 'records';

export function openDatabase(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('IDB_UNAVAILABLE', 'Stockage du navigateur indisponible.'));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, version);
    } catch {
      reject(new StorageError('IDB_UNAVAILABLE', 'Stockage du navigateur indisponible.'));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new StorageError('IDB_UNAVAILABLE', 'Ouverture du stockage impossible.'));
    request.onblocked = () =>
      reject(new StorageError('IDB_UNAVAILABLE', 'Stockage bloqué par un autre onglet.'));
  });
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new StorageError('BACKUP_INVALID', 'Enregistrement illisible dans le stockage.');
}

/** Lit tous les enregistrements (sans les déchiffrer), éventuellement dans une plage de clés. */
export function scanRecords(db: IDBDatabase, range?: IDBKeyRange): Promise<RawRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORDS, 'readonly');
    const out: RawRecord[] = [];
    const cursorRequest = tx.objectStore(RECORDS).openCursor(range);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        out.push({ k: String(cursor.key), d: toBytes(cursor.value) });
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
