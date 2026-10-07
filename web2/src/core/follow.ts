/**
 * Follow a free-form performance against a known pattern (e.g. a Sarali Swaralu line sung from a book).
 * The singer may repeat the pattern, change speed, restart or slip; we find each pass by repeated
 * local alignment (Smith–Waterman) of the expected notes against the notes that were heard.
 */

export interface HeardNote {
  /** fractional MIDI */
  midi: number;
  start: number;
  duration: number;
}

export interface PatternNote {
  token: string;
  midi: number;
}

export type FollowVerdict = 'match' | 'near' | 'wrong' | 'missing';

export interface FollowedNote {
  token: string;
  targetMidi: number;
  verdict: FollowVerdict;
  /** signed cents from the target (octave-equivalent), when a note was heard for this slot */
  cents: number | null;
  heard: HeardNote | null;
}

export interface Pass {
  start: number;
  end: number;
  notes: FollowedNote[];
  matched: number;
}

/** Signed cents from target to sung, folded to the nearest octave so singing an octave off still lines up. */
export function octaveCents(sung: number, target: number): number {
  const c = (sung - target) * 100;
  return Math.round(((((c + 600) % 1200) + 1200) % 1200) - 600);
}

/** Collapse consecutive repeats: a held or repeated swara is heard as one note. */
export function collapse(pattern: PatternNote[]): PatternNote[] {
  return pattern.filter((p, i) => i === 0 || Math.abs(p.midi - pattern[i - 1].midi) > 0.01);
}

const verdictOf = (cents: number): FollowVerdict => (Math.abs(cents) <= 20 ? 'match' : Math.abs(cents) <= 60 ? 'near' : 'wrong');

export function followPasses(heard: HeardNote[], patternIn: PatternNote[], opts: { maxPasses?: number; minCoverage?: number } = {}): Pass[] {
  const pattern = collapse(patternIn);
  const m = pattern.length;
  const maxPasses = opts.maxPasses ?? 12;
  const minCoverage = opts.minCoverage ?? 0.5;
  const used = new Array(heard.length).fill(false);
  const passes: Pass[] = [];
  const score = (i: number, j: number) => {
    if (used[i]) return -3;
    const c = Math.abs(octaveCents(heard[i].midi, pattern[j].midi));
    return c <= 60 ? 2 : c <= 150 ? 0.5 : -1;
  };
  const GAP = -1;
  for (let k = 0; k < maxPasses; k++) {
    const n = heard.length;
    const H: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    let best = 0, bi = 0, bj = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const v = Math.max(0, H[i - 1][j - 1] + score(i - 1, j - 1), H[i - 1][j] + GAP, H[i][j - 1] + GAP);
        H[i][j] = v;
        if (v > best) { best = v; bi = i; bj = j; }
      }
    }
    if (best <= 0) break;
    // backtrack
    const slot: (number | null)[] = new Array(m).fill(null);
    let i = bi, j = bj;
    let lo = bj;
    while (i > 0 && j > 0 && H[i][j] > 0) {
      if (H[i][j] === H[i - 1][j - 1] + score(i - 1, j - 1)) { slot[j - 1] = i - 1; lo = j - 1; i--; j--; }
      else if (H[i][j] === H[i - 1][j] + GAP) i--;
      else { lo = j - 1; j--; }
    }
    const coverage = (bj - lo) / m;
    if (coverage < minCoverage) break;
    const idx = slot.filter((x): x is number => x != null);
    for (let x = Math.min(...idx); x <= Math.max(...idx); x++) used[x] = true;
    const notes: FollowedNote[] = pattern.map((p, q) => {
      const h = slot[q] == null ? null : heard[slot[q]!];
      if (!h) return { token: p.token, targetMidi: p.midi, verdict: 'missing', cents: null, heard: null };
      const cents = octaveCents(h.midi, p.midi);
      return { token: p.token, targetMidi: p.midi, verdict: verdictOf(cents), cents, heard: h };
    });
    const times = idx.map((x) => heard[x]);
    passes.push({
      start: Math.min(...times.map((t) => t.start)),
      end: Math.max(...times.map((t) => t.start + t.duration)),
      notes,
      matched: notes.filter((x) => x.verdict === 'match' || x.verdict === 'near').length,
    });
  }
  return passes.sort((a, b) => a.start - b.start);
}
