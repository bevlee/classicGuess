export interface Playback { playing: boolean; start: number; duration: number; }
export interface AudioPlayer {
  load(url: string): Promise<void>;
  playClip(start: number, duration: number): Promise<void>;
  playFrom(start: number): Promise<void>;
  stop(): void;
}
/** One current + one prefetched decoded buffer, never the whole catalogue. */
export class WebAudioPlayer implements AudioPlayer {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private envelope: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private cache = new Map<string, Promise<AudioBuffer>>();
  private request = 0;
  private playbackRequest = 0;
  private volume = 0.65;
  private disposed = false;
  onPlayback?: (playback: Playback) => void;
  get duration(): number { return this.buffer?.duration ?? 0; }
  private ensureContext(): AudioContext {
    if (this.disposed) throw new Error('Audio player is closed.');
    if (!this.context) {
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.gain.value = this.volume;
      this.output.connect(this.context.destination);
    }
    return this.context;
  }
  /** Call inside a click handler, before awaiting loading, for browser autoplay rules. */
  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context.state !== 'running') await context.resume();
  }
  private decode(url: string): Promise<AudioBuffer> {
    const cached = this.cache.get(url);
    if (cached) return cached;
    const context = this.ensureContext();
    const pending = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`Recording could not be loaded (${response.status}).`);
      return context.decodeAudioData(await response.arrayBuffer());
    });
    this.cache.set(url, pending);
    if (this.cache.size > 2) this.cache.delete(this.cache.keys().next().value!);
    pending.catch(() => { if (this.cache.get(url) === pending) this.cache.delete(url); });
    return pending;
  }
  async load(url: string): Promise<void> {
    const request = ++this.request;
    this.stop();
    this.buffer = null;
    const buffer = await this.decode(url);
    if (request === this.request && !this.disposed) this.buffer = buffer;
  }
  prefetch(url: string): Promise<void> { return this.decode(url).then(() => undefined); }
  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.output && this.context) this.output.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
  }
  async playClip(start: number, duration: number): Promise<void> { await this.play(start, duration, false); }
  async playExcerpt(start: number, duration: number): Promise<void> { await this.play(start, duration, true); }
  async playFrom(start: number): Promise<void> { await this.play(start, Math.max(0, this.duration - start), true); }
  private async play(start: number, duration: number, full: boolean): Promise<void> {
    this.stop();
    const request = this.playbackRequest;
    const buffer = this.buffer;
    if (!buffer) throw new Error('Recording is still loading.');
    if (start < 0 || start >= buffer.duration || duration <= 0) throw new Error('Choose a valid playback range.');
    await this.unlock();
    if (request !== this.playbackRequest || buffer !== this.buffer || this.disposed) return;
    const context = this.ensureContext();
    const length = Math.min(duration, buffer.duration - start);
    const source = context.createBufferSource();
    const envelope = context.createGain();
    source.buffer = buffer;
    source.connect(envelope);
    envelope.connect(this.output!);
    const when = context.currentTime + 0.005;
    // Brief edge ramps avoid clicks without changing the scheduled duration.
    const fade = full ? Math.min(0.5, length / 2) : Math.min(0.003, length / 4);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(1, when + Math.min(0.003, length / 4));
    envelope.gain.setValueAtTime(1, when + length - fade);
    envelope.gain.linearRampToValueAtTime(0, when + length);
    this.source = source;
    this.envelope = envelope;
    source.onended = () => {
      source.disconnect(); envelope.disconnect();
      if (this.source === source) {
        this.source = null; this.envelope = null;
        this.onPlayback?.({ playing: false, start, duration: length });
      }
    };
    source.start(when, start, length);
    this.onPlayback?.({ playing: true, start, duration: length });
  }
  stop(): void {
    this.playbackRequest++;
    const source = this.source;
    this.source = null;
    source?.stop();
    source?.disconnect();
    this.envelope?.disconnect();
    this.envelope = null;
    this.onPlayback?.({ playing: false, start: 0, duration: 0 });
  }
  dispose(): void {
    this.stop(); this.request++; this.disposed = true; this.cache.clear(); this.buffer = null;
    void this.context?.close();
  }
}
