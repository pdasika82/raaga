import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Lesson } from '../core/lesson';
import type { PracticeSession } from '../core/session';

interface RaagaDB extends DBSchema {
  sessions: { key: string; value: PracticeSession; indexes: { date: string } };
  recordings: { key: string; value: { id: string; blob: Blob } };
  lessons: { key: string; value: Lesson };
}

let dbPromise: Promise<IDBPDatabase<RaagaDB>> | null = null;

function db(): Promise<IDBPDatabase<RaagaDB>> {
  dbPromise ??= openDB<RaagaDB>('raaga', 1, {
    upgrade(d) {
      const s = d.createObjectStore('sessions', { keyPath: 'id' });
      s.createIndex('date', 'date');
      d.createObjectStore('recordings', { keyPath: 'id' });
      d.createObjectStore('lessons', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

export const SessionStore = {
  async all(): Promise<PracticeSession[]> {
    const list = await (await db()).getAllFromIndex('sessions', 'date');
    return list.reverse();
  },
  async get(id: string): Promise<PracticeSession | undefined> {
    return (await db()).get('sessions', id);
  },
  async save(session: PracticeSession, blob?: Blob): Promise<void> {
    const d = await db();
    await d.put('sessions', session);
    if (blob) await d.put('recordings', { id: session.id, blob });
  },
  async recording(id: string): Promise<Blob | undefined> {
    return (await (await db()).get('recordings', id))?.blob;
  },
  async delete(id: string): Promise<void> {
    const d = await db();
    await d.delete('sessions', id);
    await d.delete('recordings', id);
  },
};

export const LessonStore = {
  async custom(): Promise<Lesson[]> {
    return (await db()).getAll('lessons');
  },
  async save(lesson: Lesson): Promise<void> {
    await (await db()).put('lessons', lesson);
  },
  async delete(id: string): Promise<void> {
    await (await db()).delete('lessons', id);
  },
};

/** Ask the browser not to evict our data when storage is under pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
