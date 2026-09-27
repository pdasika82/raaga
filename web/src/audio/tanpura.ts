import { hzFromMidi } from '../core/pitch';

/**
 * A synthesized tanpura: four strings plucked in a slow cycle, Pa (below) · Sa · Sa · Sa (below),
 * each with a long decay and a little detune for the characteristic shimmer.
 */
export class Tanpura {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private nextAt = 0;
  private stringIndex = 0;
  private saMidi = 55;
  private a4 = 440;
  private _volume = 0.5;
  /** seconds between plucks */
  period = 0.75;

  get running(): boolean {
    return this.timer != null;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this._volume * 0.35, this.ctx.currentTime, 0.05);
  }

  /** Must be called from a user gesture the first time. */
  start(saMidi: number, a4 = 440): void {
    this.saMidi = saMidi;
    this.a4 = a4;
    if (this.running) return;
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = this._volume * 0.35;
      // gentle low shelf so the drone sits under the voice
      const shelf = this.ctx.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 3000;
      shelf.gain.value = -6;
      this.master.connect(shelf).connect(this.ctx.destination);
    }
    this.nextAt = this.ctx.currentTime + 0.05;
    this.stringIndex = 0;
    this.timer = window.setInterval(() => this.schedule(), 100);
    this.schedule();
  }

  /** Retune without stopping, e.g. after Sa or the starting note changes. */
  retune(saMidi: number, a4 = 440): void {
    this.saMidi = saMidi;
    this.a4 = a4;
  }

  stop(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.master && this.ctx) {
      const g = this.master.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      const ctx = this.ctx, master = this.master;
      window.setTimeout(() => { if (!this.running) { master.disconnect(); if (this.master === master) this.master = null; void ctx.suspend(); } }, 2500);
    }
  }

  /** Render `seconds` of the drone offline (used for tests and previews). */
  renderOffline(saMidi: number, a4: number, seconds: number, sampleRate = 48000): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(1, Math.round(seconds * sampleRate), sampleRate);
    const master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    const strings = [saMidi - 5, saMidi, saMidi, saMidi - 12];
    for (let i = 0, at = 0.05; at < seconds; i++, at += this.period) this.pluck(hzFromMidi(strings[i % 4], a4), at, ctx, master);
    return ctx.startRendering();
  }

  private strings(): number[] {
    // Pa below Sa, Sa, Sa, Sa an octave below
    return [this.saMidi - 5, this.saMidi, this.saMidi, this.saMidi - 12];
  }

  private schedule(): void {
    if (!this.ctx) return;
    const lookahead = 0.3;
    while (this.nextAt < this.ctx.currentTime + lookahead) {
      const midi = this.strings()[this.stringIndex % 4];
      this.pluck(hzFromMidi(midi, this.a4), this.nextAt);
      this.stringIndex++;
      this.nextAt += this.period;
    }
  }

  private pluck(hz: number, at: number, ctx: BaseAudioContext = this.ctx!, master: AudioNode = this.master!): void {
    const decay = 4.5;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(1, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.001, at + decay);
    // damping: the bright jivari buzz fades as the string decays
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(Math.min(6000, hz * 24), at);
    lp.frequency.exponentialRampToValueAtTime(Math.max(600, hz * 4), at + decay);
    env.connect(lp).connect(master);
    for (const [detune, gain] of [[0, 0.6], [4, 0.3], [-3, 0.2]] as [number, number][]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(env);
      osc.start(at);
      osc.stop(at + decay + 0.1);
    }
    // faint octave partial for body
    const oct = ctx.createOscillator();
    oct.type = 'triangle';
    oct.frequency.value = hz * 2;
    const og = ctx.createGain();
    og.gain.value = 0.15;
    oct.connect(og).connect(env);
    oct.start(at);
    oct.stop(at + decay + 0.1);
  }
}

export const tanpura = new Tanpura();
