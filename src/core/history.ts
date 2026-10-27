/**
 * Saved generations, persisted in IndexedDB.
 */

import type { WallpaperParams } from './params';
import { sanitizeParams } from './params';

export interface HistoryEntry {
  id: string;
  createdAt: number;
  params: WallpaperParams;
  thumb: string; // JPEG data-URL
}

const DB_NAME = 'spectrawall';
const STORE = 'history';

export class HistoryStore {
  private db: IDBDatabase;

  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  static async open(): Promise<HistoryStore> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(new HistoryStore(req.result));
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
  }

  private tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });
  }

  async list(): Promise<HistoryEntry[]> {
    const all = await this.tx<HistoryEntry[]>('readonly', (s) => s.getAll() as IDBRequest<HistoryEntry[]>);
    return all.sort((a, b) => b.createdAt - a.createdAt).map(sanitizeEntry);
  }

  async put(entry: HistoryEntry): Promise<void> {
    await this.tx('readwrite', (s) => s.put(entry));
  }

  async delete(id: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(id));
  }

  async clear(): Promise<void> {
    await this.tx('readwrite', (s) => s.clear());
  }
}

function sanitizeEntry(e: HistoryEntry): HistoryEntry {
  return {
    id: typeof e.id === 'string' ? e.id : crypto.randomUUID(),
    createdAt: typeof e.createdAt === 'number' ? e.createdAt : 0,
    params: sanitizeParams(e.params),
    thumb: typeof e.thumb === 'string' ? e.thumb : '',
  };
}

// ---------- import / export ----------

export function serializeCollection(entries: HistoryEntry[]): string {
  return JSON.stringify(
    {
      app: 'spectrawall',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: entries.map(({ id, createdAt, params, thumb }) => ({ id, createdAt, params, thumb })),
    },
    null,
    2,
  );
}

export function parseCollection(json: string): HistoryEntry[] {
  const data = JSON.parse(json) as unknown;
  const arr = Array.isArray(data)
    ? data // tolerate a bare array of entries
    : (data as { entries?: unknown }).entries;
  if (!Array.isArray(arr)) throw new Error('Invalid collection file');
  return arr.map((raw, i) => {
    const e = raw as Partial<HistoryEntry>;
    return sanitizeEntry({
      id: typeof e.id === 'string' ? e.id : crypto.randomUUID(),
      createdAt: typeof e.createdAt === 'number' ? e.createdAt : Date.now() + i,
      params: sanitizeParams(e.params),
      thumb: typeof e.thumb === 'string' ? e.thumb : '',
    });
  });
}
