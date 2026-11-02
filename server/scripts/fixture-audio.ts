/** Synthetic harmonic tones. These are software fixtures, never claimed as human singing. */
export function fixturePcm(offsetCents = 0, rate = 12000, start = 0.5): Float32Array {
  const pcm = new Float32Array(Math.ceil((start + 5.5) * rate));
  const midi = [60, 62, 64, 62, 60];
  for (let n = 0; n < midi.length; n++) {
    const frequency = 440 * 2 ** ((midi[n] + offsetCents / 100 - 69) / 12);
    for (let sample = 0; sample < Math.floor(0.9 * rate); sample++) {
      const t = sample / rate;
      const envelope = Math.min(1, t / 0.025, (0.9 - t) / 0.025);
      pcm[Math.round((start + n) * rate) + sample] = envelope * (0.3 * Math.sin(2 * Math.PI * frequency * t) + 0.08 * Math.sin(4 * Math.PI * frequency * t));
    }
  }
  return pcm;
}
export function encodeWav(pcm: Float32Array, rate = 12000): Buffer {
  const wav = Buffer.alloc(44 + pcm.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  return wav;
}
