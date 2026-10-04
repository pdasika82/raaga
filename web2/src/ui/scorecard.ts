import { analyze, hasVoice, score, type PerformanceReport } from '@core/analyzer';
import type { Notation } from '@core/pitch';
import { scaleById, type Scale } from '@core/scale';
import type { PracticeSession } from '@core/session';
import { detectedLabel, parseToken, tokenSpoken } from '@core/swara';
import { targetScore, type TargetScore } from '@core/targetScore';
import { h } from './dom';
import { showScoreGuide } from './guide';

export interface SessionScore {
  value: number | null;
  cls: 'good' | 'mid' | 'low' | 'none';
  /** short line shown beside the badge */
  summary: string;
  target: TargetScore | null;
}

const band = (v: number): SessionScore['cls'] => (v >= 80 ? 'good' : v >= 55 ? 'mid' : 'low');

/** The app's score for a session: against the asked notes when there are any, else nearest-note tuning. */
export function sessionScore(session: PracticeSession, report?: PerformanceReport): SessionScore {
  const ts = targetScore(session.targets);
  if (ts) {
    const heard = ts.notes.some((n) => n.verdict !== 'silent');
    return {
      value: heard ? ts.score : null,
      cls: heard ? band(ts.score) : 'none',
      summary: `Matched ${ts.matched} of ${ts.total}${ts.avgDistance != null ? ` · avg ${ts.avgDistance}¢ from target` : ''}`,
      target: ts,
    };
  }
  const r = report ?? analyze(session.samples, scaleById(session.scaleId), session.tonic, session.a4, { totalSeconds: session.duration });
  if (!hasVoice(r)) return { value: null, cls: 'none', summary: 'No singing detected', target: null };
  const v = score(r);
  return { value: v, cls: band(v), summary: `Within ±20¢ ${Math.round(r.within20 * 100)}% · on scale ${Math.round(r.scaleToneFraction * 100)}%`, target: null };
}

/** Score badge that opens a short breakdown when clicked. */
export function scoreBadge(session: PracticeSession, notation: Notation, opts: { small?: boolean; label?: boolean } = {}): HTMLElement {
  const sc = sessionScore(session);
  const text = sc.value == null ? (opts.label ? 'Score –' : '–') : opts.label ? `Score ${sc.value}` : String(sc.value);
  return h('button', {
    class: `badge badge-${sc.cls}${opts.small ? ' badge-sm' : ''} badge-btn`,
    title: 'How this score was worked out',
    onClick: (e) => { e.preventDefault(); e.stopPropagation(); showScoreBreakdown(session, notation); },
  }, text);
}

export function showScoreBreakdown(session: PracticeSession, notation: Notation): void {
  const sc = sessionScore(session);
  const scale: Scale = scaleById(session.scaleId);
  const overlay = h('div', { class: 'overlay modal', onClick: (e) => { if (e.target === overlay) overlay.remove(); } });
  const body: (HTMLElement | null)[] = [];
  if (sc.target) {
    const ts = sc.target;
    const lead = ts.matched === ts.total
      ? `Every note matched${ts.avgDistance != null ? `, on average ${ts.avgDistance} cents from the target` : ''}.`
      : ts.matched === 0
        ? 'None of the notes matched the swara that was asked for, so every note earned 0.'
        : `${ts.matched} of ${ts.total} notes matched the swara that was asked for; the others earned 0.`;
    body.push(h('p', {}, h('b', {}, `Score ${ts.score}`), ` = the average credit of the ${ts.total} notes × 100. ${lead}`));
    body.push(h('table', { class: 'ref-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Asked'), h('th', {}, 'You sang'), h('th', {}, 'Credit'))),
      h('tbody', {}, ...ts.notes.map((n) => {
        const tok = parseToken(n.token);
        const asked = tok ? tokenSpoken(tok, notation, session.tonic, scale) : n.token;
        const sung = n.verdict === 'silent' ? 'not heard'
          : n.verdict === 'wrong' ? `${detectedLabel(n.detected!, scale, notation, session.tonic).replace(/^near /, '')} (${n.cents! > 0 ? '+' : '−'}${Math.abs(n.cents!)}¢)`
          : `${asked} ${n.cents! > 0 ? '+' : n.cents! < 0 ? '−' : '±'}${Math.abs(n.cents!)}¢`;
        return h('tr', { class: `row-${n.verdict}` }, h('td', {}, h('span', { class: `vdot vdot-${n.verdict}` }), asked), h('td', {}, sung), h('td', { class: 'diff' }, n.credit.toFixed(2).replace(/\.00$/, '')));
      }))));
    body.push(h('p', { class: 'muted small' }, 'Within 20¢ of the asked swara = 1. From 20 to 60¢ it falls to 0.5. A different swara or no note = 0, however well tuned.'));
  } else {
    body.push(h('p', {}, h('b', {}, `Score ${sc.value ?? '–'}`), ' measures free singing: how close you stayed to the nearest note of the raga (70%) and how much of the time you sang notes that belong to it (30%).'));
    body.push(h('p', { class: 'muted small' }, sc.summary));
  }
  overlay.append(h('div', { class: 'card sheet modal-card' },
    h('div', { class: 'row space' }, h('h3', {}, 'How this score was worked out'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: () => overlay.remove() }, '✕')),
    ...body,
    h('button', { class: 'link small', onClick: () => { overlay.remove(); showScoreGuide(); } }, 'Full score guide ›')));
  document.body.append(overlay);
}

