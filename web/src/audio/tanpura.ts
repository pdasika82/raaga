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
  /** seconds between plucks; strings ring for ~7 s so six or seven overlap */
  period = 1.1;

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
      // a compressor evens out the plucks into a continuous hum; a shelf keeps it under the voice
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -30;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.02;
      comp.release.value = 0.6;
      const shelf = this.ctx.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 3000;
      shelf.gain.value = -6;
      this.master.connect(comp).connect(shelf).connect(this.ctx.destination);
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
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -30; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.02; comp.release.value = 0.6;
    master.connect(comp).connect(ctx.destination);
    const sa = saMidi < 52 ? saMidi + 12 : saMidi;
    const strings = [sa - 5, sa, sa, sa - 12];
    for (let i = 0, at = 0.05; at < seconds; i++, at += this.period) this.pluck(hzFromMidi(strings[i % 4], a4), at, ctx, master);
    return ctx.startRendering();
  }

  /**
   * Sa for the drone. A tanpura is never strung as low as a bass singer's starting note, and
   * phone speakers reproduce little below ~100 Hz, so a Sa under E3 is played an octave up.
   */
  private droneSa(): number {
    return this.saMidi < 52 ? this.saMidi + 12 : this.saMidi;
  }

  private strings(): number[] {
    // Pa below Sa, Sa, Sa, Sa an octave below
    const sa = this.droneSa();
    return [sa - 5, sa, sa, sa - 12];
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
    const decay = 7.5;
    const env = ctx.createGain();
    // soft rise rather than a snap, then a long ring
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(0.9, at + 0.09);
    env.gain.setTargetAtTime(0.0008, at + 0.3, decay / 4);
    // jivari-like bloom: the tone starts mellow, brightens over ~0.8 s, then slowly darkens
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(Math.max(500, hz * 5), at);
    lp.frequency.exponentialRampToValueAtTime(Math.min(5000, hz * 16), at + 0.8);
    lp.frequency.exponentialRampToValueAtTime(Math.max(400, hz * 3.5), at + decay);
    env.connect(lp).connect(master);
    for (const [detune, gain] of [[0, 0.5], [3, 0.25], [-2, 0.2]] as [number, number][]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(env);
      osc.start(at);
      osc.stop(at + decay + 0.5);
    }
    // body: fundamental and octave, steady under the bloom
    for (const [mult, gain] of [[1, 0.35], [2, 0.12]] as [number, number][]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz * mult;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(env);
      o.start(at);
      o.stop(at + decay + 0.5);
    }
  }
}

export const tanpura = new Tanpura();
