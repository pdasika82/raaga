import { DANCE_LESSONS } from './lessons';
export interface DanceSession {
  id: string;
  lessonId: string;
  date: string;
  seconds: number;
  checks: number[];
  note: string;
}

const key = (uid: string | null) => `lms.kuchipudi.v1.${uid ? `user:${encodeURIComponent(uid)}` : 'guest'}`;

/** Account namespaces never implicitly import a guest's or another learner's journal. */
export function readDanceSessions(uid: string | null, storage: Pick<Storage, 'getItem'> = localStorage): DanceSession[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(key(uid)) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((entry): entry is DanceSession => {
      if (!entry || typeof entry !== 'object') return false;
      const lesson = DANCE_LESSONS.find(lesson => lesson.id === entry.lessonId);
      return !!lesson && typeof entry.id === 'string' && typeof entry.date === 'string' && Number.isFinite(Date.parse(entry.date))
        && Number.isFinite(entry.seconds) && entry.seconds > 0 && entry.seconds <= 86400
        && typeof entry.note === 'string' && entry.note.length <= 2000
        && Array.isArray(entry.checks) && entry.checks.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < lesson.cues.length);
    }).slice(0, 200);
  } catch { return []; }
}

export function writeDanceSession(uid: string | null, session: DanceSession, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): boolean {
  try {
    const previous = readDanceSessions(uid, storage).filter(entry => entry.id !== session.id);
    storage.setItem(key(uid), JSON.stringify([session, ...previous].slice(0, 200)));
    return true;
  } catch { return false; }
}

export function clearDanceSessions(uid: string | null, storage: Pick<Storage, 'removeItem'> = localStorage): boolean {
  try { storage.removeItem(key(uid)); return true; } catch { return false; }
}
