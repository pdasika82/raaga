import type { TargetMark } from './session';

export type NoteVerdict = 'match' | 'near' | 'wrong' | 'silent';

export interface NoteCredit {
  token: string;
  verdict: NoteVerdict;
  /** signed cents from the target, when a note was heard */
  cents: number | null;
  detected: number | null;
  /** 0..1 */
  credit: number;
}

export interface TargetScore {
  /** 0..100 */
  score: number;
  matched: number;
  total: number;
  /** mean |cents| from the target over notes that were heard */
  avgDistance: number | null;
  notes: NoteCredit[];
}

/** Credit for one note: 1 within 20 cents, falling to 0.5 at 60 cents, 0 beyond or if not heard. */
export function noteCredit(cents: number | null): number {
  if (cents == null) return 0;
  const c = Math.abs(cents);
  if (c <= 20) return 1;
  if (c <= 60) return 1 - (0.5 * (c - 20)) / 40;
  return 0;
}

/** Score a take against the notes that were asked for. Null when the session has no targets. */
export function targetScore(targets: TargetMark[] | undefined): TargetScore | null {
  if (!targets?.length) return null;
  const notes: NoteCredit[] = targets.map((t) => {
    if (t.matchedAt != null && t.cents != null) {
      return { token: t.token, verdict: Math.abs(t.cents) <= 20 ? 'match' : 'near', cents: t.cents, detected: t.detected ?? null, credit: noteCredit(t.cents) };
    }
    if (t.detected != null && t.midi != null) {
      return { token: t.token, verdict: 'wrong', cents: Math.round((t.detected - t.midi) * 100), detected: t.detected, credit: 0 };
    }
    return { token: t.token, verdict: 'silent', cents: null, detected: null, credit: 0 };
  });
  const heard = notes.filter((n) => n.cents != null);
  return {
    score: Math.round((100 * notes.reduce((a, n) => a + n.credit, 0)) / notes.length),
    matched: notes.filter((n) => n.verdict === 'match' || n.verdict === 'near').length,
    total: notes.length,
    avgDistance: heard.length ? Math.round(heard.reduce((a, n) => a + Math.abs(n.cents!), 0) / heard.length) : null,
    notes,
  };
}
