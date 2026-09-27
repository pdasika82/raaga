import { hzFromMidi } from '@core/pitch';

let ctx: AudioContext | null = null;

/** Play a soft reference tone. Returns when it has finished. */
export function playTone(midi: number, a4 = 440, seconds = 1.5): Promise<void> {
  return new Promise((resolve) => {
    try {
      ctx ??= new AudioContext();
      void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = hzFromMidi(midi, a4);
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
      gain.gain.setValueAtTime(0.25, t + seconds - 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(t + seconds + 0.05);
      osc.onended = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Play several notes in a row, e.g. a demonstration of Sa Ri Ga. */
export async function playPhrase(midis: number[], a4 = 440, seconds = 0.7): Promise<void> {
  for (const m of midis) await playTone(m, a4, seconds);
}
