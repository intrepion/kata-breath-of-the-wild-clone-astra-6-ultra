export class AdventureAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private enabled = true;
  private nextNote = 0;
  private noteIndex = 0;

  start(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.gain.value = this.enabled ? 0.17 : 0;
      this.output.connect(this.context.destination);
      const buffer = this.context.createBuffer(
        1,
        this.context.sampleRate * 3,
        this.context.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      let value = 0;
      for (let i = 0; i < samples.length; i++) {
        value = (value + (Math.random() * 2 - 1) * 0.02) / 1.02;
        samples[i] = value * 1.8;
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 380;
      source.connect(filter);
      filter.connect(this.output);
      source.start();
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.output?.gain.setTargetAtTime(enabled ? 0.17 : 0, this.context!.currentTime, 0.15);
  }
  update(time: number): void {
    if (!this.context || !this.enabled || time < this.nextNote) return;
    this.nextNote = time + 3.5 + Math.random() * 4;
    const notes = [293.66, 440, 587.33, 493.88, 369.99, 440, 659.25, 587.33];
    this.tone(notes[this.noteIndex++ % notes.length], 2.8, 0.22, 'sine');
  }
  play(event: string): void {
    if (!this.context || !this.enabled) return;
    if (event === 'success' || event === 'victory') {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) =>
        this.tone(frequency, 1.2, 0.35, 'sine', i * 0.13),
      );
    } else if (event === 'attack') {
      this.tone(150, 0.13, 0.32, 'triangle');
    } else if (event === 'jump') {
      this.tone(330, 0.2, 0.13, 'sine');
    } else if (event === 'damage') {
      this.tone(98, 0.3, 0.25, 'triangle');
    }
  }
  private tone(
    frequency: number,
    length: number,
    volume: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    const context = this.context!;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    oscillator.connect(gain);
    gain.connect(this.output!);
    oscillator.start(start);
    oscillator.stop(start + length);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
}
