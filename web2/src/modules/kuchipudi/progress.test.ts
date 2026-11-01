import { beforeEach, describe, expect, it } from 'vitest';
import { clearDanceSessions, readDanceSessions, writeDanceSession, type DanceSession } from './progress';

let data: Map<string, string>;
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); },
  removeItem: (key: string) => { data.delete(key); },
};
const session: DanceSession = { id: 'one', lessonId: 'begin', date: '2026-11-01T12:00:00Z', seconds: 120, checks: [0, 2], note: 'Ask about the pause.' };
beforeEach(() => { data = new Map(); });

describe('Kuchipudi practice journal', () => {
  it('isolates signed-in accounts from each other and from guest history', () => {
    writeDanceSession(null, session, storage);
    expect(readDanceSessions('learner-a', storage)).toEqual([]);
    writeDanceSession('learner-a', { ...session, note: 'A private note' }, storage);
    expect(readDanceSessions('learner-b', storage)).toEqual([]);
    expect(readDanceSessions(null, storage)[0].note).toBe(session.note);
    clearDanceSessions('learner-a', storage);
    expect(readDanceSessions('learner-a', storage)).toEqual([]);
    expect(readDanceSessions(null, storage)).toHaveLength(1);
  });

  it('does not duplicate a repeated save and bounds retained history', () => {
    writeDanceSession(null, session, storage); writeDanceSession(null, session, storage);
    expect(readDanceSessions(null, storage)).toHaveLength(1);
    for (let i = 0; i < 220; i++) writeDanceSession(null, { ...session, id: String(i) }, storage);
    const history = readDanceSessions(null, storage);
    expect(history).toHaveLength(200);
    expect(history[0].id).toBe('219');
  });

  it('recovers from corrupted or unsupported data without showing bogus progress', () => {
    writeDanceSession(null, session, storage);
    const key = [...data.keys()][0];
    data.set(key, '{bad json');
    expect(readDanceSessions(null, storage)).toEqual([]);
    data.set(key, JSON.stringify([null, { ...session, seconds: -1 }, { ...session, lessonId: 'made-up' }, { ...session, checks: [99] }, session]));
    expect(readDanceSessions(null, storage)).toEqual([session]);
  });

  it('reports unavailable storage instead of pretending the save worked', () => {
    const unavailable = { ...storage, setItem: () => { throw new Error('Quota exceeded'); } };
    expect(writeDanceSession(null, session, unavailable)).toBe(false);
  });
});
