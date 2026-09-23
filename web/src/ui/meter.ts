import { hzFromMidi, SWARA_NAMES, westernName, pitchClass, type Notation, type PitchFrame } from '../core/pitch';
import { degreeName, type Scale, type ScaleReading } from '../core/scale';
import { h } from './dom';

/** Big note name plus a ±50 cent needle, and the scale strip below it. */
export class PitchMeter {
  readonly el: HTMLElement;
  private note: HTMLElement;
  private sub: HTMLElement;
  private needle: HTMLElement;
  private cents: HTMLElement;
  private level: HTMLElement;
  private strip: HTMLElement;
  private pills = new Map<number, HTMLElement>();

  constructor() {
    this.note = h('div', { class: 'meter-note' }, '—');
    this.sub = h('div', { class: 'meter-sub' }, 'Tap Start to listen');
    this.needle = h('div', { class: 'needle' });
    this.cents = h('span', { class: 'cents' }, ' ');
    this.level = h('div', { class: 'level-bar' });
    this.strip = h('div', { class: 'strip' });
    this.el = h(
      'section',
      { class: 'card meter' },
      this.note,
      this.sub,
      h(
        'div',
        { class: 'gauge' },
        h('div', { class: 'gauge-track' }),
        h('div', { class: 'gauge-zone' }),
        ...[-50, -25, 0, 25, 50].map((c) => h('div', { class: `tick${c === 0 ? ' tick-center' : ''}`, style: `left:${50 + c}%` })),
        this.needle,
      ),
      h('div', { class: 'gauge-labels' }, h('span', {}, '♭ −50'), this.cents, h('span', {}, '+50 ♯')),
      h('div', { class: 'level' }, this.level),
      this.strip,
    );
  }

  setScale(scale: Scale, tonic: number, notation: Notation): void {
    this.strip.replaceChildren();
    this.pills.clear();
    for (const st of [...scale.intervals, 12]) {
      const pc = pitchClass(st);
      let name = degreeName(scale, pc, tonic, notation);
      if (st === 12) name = notation === 'indian' ? 'Ṡ' : name + '′';
      const pill = h('span', { class: 'pill' }, name);
      this.strip.append(pill);
      if (st !== 12) this.pills.set(pc, pill);
      else this.pills.set(12, pill);
    }
  }

  update(frame: PitchFrame, reading: ScaleReading | null, notation: Notation, tonic: number, listening: boolean): void {
    this.level.style.width = `${Math.min(100, frame.rms * 600)}%`;
    for (const [, p] of this.pills) p.className = 'pill';
    if (!reading) {
      this.note.textContent = '—';
      this.note.className = 'meter-note';
      this.sub.textContent = listening ? 'Sing a note' : 'Tap Start to listen';
      this.needle.style.opacity = '0';
      this.cents.textContent = ' ';
      return;
    }
    const cls = `acc-${reading.accuracy}`;
    const swara = SWARA_NAMES[reading.semitoneFromTonic];
    const west = westernName(reading.chromaticMidi);
    this.note.textContent = notation === 'indian' ? swara : west;
    this.note.className = `meter-note ${cls}`;
    const hz = `${hzFromMidi(reading.midi).toFixed(0)} Hz`;
    const other = notation === 'indian' ? west : swara;
    if (reading.isScaleTone) {
      this.sub.textContent = `${other} · ${hz}`;
    } else {
      const nearest = notation === 'indian' ? SWARA_NAMES[pitchClass(reading.scaleMidi - tonic)] : westernName(reading.scaleMidi);
      this.sub.textContent = `${other} · not in scale · nearest ${nearest}`;
    }
    const c = Math.max(-50, Math.min(50, reading.displayCents));
    this.needle.style.opacity = '1';
    this.needle.style.left = `${50 + c}%`;
    this.needle.className = `needle ${cls}`;
    this.cents.textContent = `${c >= 0 ? '+' : ''}${c.toFixed(0)} ¢`;
    this.cents.className = `cents ${cls}`;
    if (reading.isScaleTone) {
      const pill = this.pills.get(reading.semitoneFromTonic);
      if (pill) pill.className = `pill active ${cls}`;
    }
  }
}
