import { AudioCapture } from '@audio/capture';
import { tanpura } from '@audio/tanpura';
import { midiFromHz, westernName, westernPitchClassName, WESTERN_NAMES } from '@core/pitch';
import { startingMidi } from '@core/swara';
import type { App, Route } from './app';
import { h } from './dom';
import { playPhrase, playTone } from './tone';

/** Top bar: brand, drone toggle, Sa · Start chip, and the section tabs. */
export function topBar(app: App, route: Route, tradition: string): HTMLElement {
  const { prefs } = app;
  const start = startingMidi(prefs.tonic, prefs.saOctave);
  const droneBtn = h('button', { class: `link drone-btn${tanpura.running ? ' on' : ''}` }, tanpura.running ? '♫ Drone on' : '♫ Drone off');
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: prefs.droneVolume, class: 'tanpura-vol', hidden: !tanpura.running, 'aria-label': 'Drone volume' }) as HTMLInputElement;
  droneBtn.addEventListener('click', () => {
    if (tanpura.running) { tanpura.stop(); droneBtn.textContent = '♫ Drone off'; droneBtn.classList.remove('on'); vol.hidden = true; }
    else { tanpura.volume = app.prefs.droneVolume; tanpura.start(startingMidi(app.prefs.tonic, app.prefs.saOctave), app.prefs.a4); droneBtn.textContent = '♫ Drone on'; droneBtn.classList.add('on'); vol.hidden = false; }
  });
  vol.addEventListener('input', () => { tanpura.volume = Number(vol.value); app.update({ droneVolume: Number(vol.value) }); });
  const tab = (r: Route, label: string) => h('button', { class: `link${route === r || (route === 'session' && r === 'sessions') ? ' active' : ''}`, onClick: () => app.navigate(r) }, label);
  return h('header', { class: 'topbar' },
    h('span', { class: 'brand' }, h('span', { class: 'logo' }, 'Sa'), h('b', {}, 'Raaga Echo'), h('span', { class: 'divider' }), h('span', { class: 'muted' }, tradition)),
    h('span', { class: 'topbar-right' },
      h('span', { class: 'lr-tabs' }, tab('practice', 'Practice'), tab('sessions', 'Sessions'), tab('settings', 'Settings')),
      h('span', { class: 'row' }, droneBtn, vol),
      h('button', { class: 'pitch-chip', onClick: () => showPitchSetup(app) }, h('span', {}, `Sa ${westernPitchClassName(prefs.tonic)}`), h('span', { class: 'dot' }, '·'), h('span', {}, `Start ${westernName(start)}`), h('span', { class: 'dot' }, '⌄'))));
}

/** "Find a comfortable Sa" modal: selects, hear it, optional hum to suggest, use. */
export function showPitchSetup(app: App, onDone?: () => void): void {
  let tonic = app.prefs.tonic;
  let octave = app.prefs.saOctave;
  const overlay = h('div', { class: 'overlay modal', onClick: (e) => { if (e.target === overlay) close(); } });
  const capture = new AudioCapture();
  const close = () => { void capture.stop(); overlay.remove(); };
  const saSel = h('select', { class: 'select' });
  WESTERN_NAMES.forEach((n, i) => saSel.append(h('option', { value: i, selected: i === tonic }, n)));
  const octSel = h('select', { class: 'select' });
  for (const o of [2, 3, 4, 5]) octSel.append(h('option', { value: o, selected: o === octave }, String(o)));
  saSel.addEventListener('change', () => { tonic = Number(saSel.value); });
  octSel.addEventListener('change', () => { octave = Number(octSel.value); });
  const start = () => startingMidi(tonic, octave);

  const humStatus = h('div', { class: 'muted small' }, '');
  const humBtn = h('button', { class: 'btn btn-secondary' }, 'Use microphone');
  let window: { at: number; midi: number }[] = [];
  let hums: number[] = [];
  humBtn.addEventListener('click', async () => {
    if (capture.running) { await capture.stop(); humBtn.textContent = 'Use microphone'; humStatus.textContent = ''; return; }
    try {
      await capture.start();
    } catch (err) { humStatus.textContent = (err as Error).message; return; }
    humBtn.textContent = 'Stop';
    humStatus.textContent = 'Listening… hum gently and hold it.';
    hums = []; window = [];
    capture.onFrame((f) => {
      const now = performance.now();
      if (f.frequency != null && f.clarity >= 0.5 && f.rms >= 0.008) window.push({ at: now, midi: midiFromHz(f.frequency, app.prefs.a4) });
      window = window.filter((w) => now - w.at <= 1300);
      if (window.length < 20) return;
      const sorted = window.map((w) => w.midi).sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1];
      const steady = window.filter((w) => Math.abs(w.midi - median) <= 0.6);
      if (steady.length < 18 || now - window[0].at < 1100) return;
      hums.push(steady.reduce((a, w) => a + w.midi, 0) / steady.length);
      window = [];
      const m = Math.round(hums.sort((a, b) => a - b)[hums.length >> 1]);
      tonic = ((m % 12) + 12) % 12;
      octave = Math.floor(m / 12) - 1;
      saSel.value = String(tonic);
      octSel.value = String(octave);
      humStatus.textContent = `Heard ${westernName(m)}. Suggested Sa ${westernPitchClassName(tonic)}, starting note ${westernName(start())}. Hum again to refine, or Hear Sa.`;
      if (hums.length >= 3) { void capture.stop(); humBtn.textContent = 'Use microphone'; }
    });
  });

  overlay.append(h('div', { class: 'card sheet modal-card' },
    h('div', { class: 'row space' }, h('span', { class: 'eyebrow accent' }, 'STARTING PITCH'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: close }, '✕')),
    h('h2', {}, 'Find a comfortable Sa'),
    h('p', { class: 'muted' }, 'Choose a note you can sing easily, with room to go higher and lower.'),
    h('div', { class: 'row' },
      h('label', { class: 'field col grow' }, h('span', { class: 'muted small' }, 'Sa'), saSel),
      h('label', { class: 'field col grow' }, h('span', { class: 'muted small' }, 'Starting octave'), octSel)),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-secondary', onClick: () => void playTone(start(), app.prefs.a4, 1.5) }, '▶ Hear Sa'),
      h('button', { class: 'link', onClick: () => void playPhrase([start() - 5, start(), start() + 12], app.prefs.a4, 0.9) }, 'Hear lower Pa, Sa, upper Sa')),
    h('div', { class: 'card hum' },
      h('b', {}, 'Or start with a comfortable hum'),
      h('div', { class: 'muted small' }, "Hum gently for a few seconds. We'll suggest a starting point for you to try."),
      humBtn, humStatus),
    h('p', { class: 'muted small' }, 'Sing along with the range check before choosing. A hum is a starting point, not a measure of your full range.'),
    h('div', { class: 'row end' },
      h('button', { class: 'btn btn-secondary', onClick: close }, 'Cancel'),
      h('button', { class: 'btn', onClick: () => { app.update({ tonic, saOctave: octave }); close(); onDone?.(); } }, 'Use this Sa'))));
  document.body.append(overlay);
}
