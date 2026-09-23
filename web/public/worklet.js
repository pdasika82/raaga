// Collects microphone audio into 4096-sample blocks (hop 2048) and posts them
// to the main thread, which runs pitch detection.
class BlockForwarder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 4096;
    this.hop = 2048;
    this.buf = new Float32Array(this.size);
    this.filled = 0;
    this.frame = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];
    let i = 0;
    while (i < ch.length) {
      const n = Math.min(ch.length - i, this.size - this.filled);
      this.buf.set(ch.subarray(i, i + n), this.filled);
      this.filled += n;
      i += n;
      if (this.filled === this.size) {
        const block = this.buf.slice(0);
        // frame index of the first sample in this block
        this.port.postMessage({ frame: this.frame, block }, [block.buffer]);
        this.frame += this.hop;
        this.buf.copyWithin(0, this.hop);
        this.filled = this.size - this.hop;
      }
    }
    return true;
  }
}
registerProcessor('block-forwarder', BlockForwarder);
