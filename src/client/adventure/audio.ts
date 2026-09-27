/** Small original synthesized score; created only by a user gesture. */
export class GameAudio {
  private context?: AudioContext;
  private timer?: ReturnType<typeof setInterval>;
  private step = 0;
  private destroyed = false;
  music = false;
  effects = true;
  constructor(private score: 'meadow' | 'night' | 'none') {}
  async unlock() {
    if (this.destroyed) return;
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.destroyed) return;
    if (!this.timer) this.timer = setInterval(() => this.beat(), 420);
  }
  private tone(frequency: number, duration: number, volume: number, delay = 0) {
    const c = this.context;
    if (!c || c.state !== 'running') return;
    const oscillator = c.createOscillator(),
      gain = c.createGain(),
      at = c.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(c.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  private beat() {
    if (!this.music || this.score === 'none') return;
    const melody =
      this.score === 'night'
        ? [64, 71, 67, 0, 62, 67, 69, 0, 60, 67, 64, 0, 62, 69, 67, 0]
        : [72, 76, 79, 0, 76, 74, 72, 0, 69, 72, 76, 0, 67, 71, 74, 0];
    const note = melody[this.step++ % melody.length];
    if (note) this.tone(440 * 2 ** ((note - 69) / 12), 0.7, 0.035);
    if (this.step % 4 === 1) this.tone(this.score === 'night' ? 164.81 : 130.81, 1.5, 0.025);
  }
  cue(type: 'collect' | 'jump' | 'arrive' | 'recover' | 'win') {
    if (!this.effects) return;
    const notes =
      type === 'win'
        ? [523.25, 659.25, 783.99, 1046.5]
        : type === 'collect'
          ? [659.25, 987.77]
          : type === 'recover'
            ? [220, 261.63]
            : type === 'jump'
              ? [330, 440]
              : [523.25];
    notes.forEach((n, i) => this.tone(n, 0.2, 0.06, i * 0.08));
  }
  pause(paused: boolean) {
    if (this.context)
      void (paused ? this.context.suspend() : this.context.resume()).catch(() => {});
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearInterval(this.timer);
    if (this.context) void this.context.close().catch(() => {});
  }
}
