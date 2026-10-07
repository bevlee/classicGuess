import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { WebAudioPlayer } from './player';
let sources: ReturnType<typeof source>[];
const source = () => ({ buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null });
const gain = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() } });
let envelopes: ReturnType<typeof gain>[];
let resume: () => Promise<void>;
class FakeContext {
  currentTime = 12;
  state = 'running';
  destination = {};
  createGain() { const node = gain(); envelopes.push(node); return node; }
  createBufferSource() { const node = source(); sources.push(node); return node; }
  decodeAudioData = vi.fn(async () => ({ duration: 40 }));
  resume() { return resume(); }
  close = vi.fn(async () => {});
}
beforeEach(() => {
  sources = []; envelopes = []; resume = async () => {};
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
});
afterEach(() => vi.unstubAllGlobals());
describe('precise Web Audio playback', () => {
  it('schedules each clip from zero with its exact duration and a fresh source', async () => {
    const player = new WebAudioPlayer(); await player.load('/test.opus');
    for (const duration of [.1, .5, 2, 8, 15]) await player.playClip(0, duration);
    expect(sources).toHaveLength(5);
    expect(sources.map(s => s.start.mock.calls[0])).toEqual([.1,.5,2,8,15].map(d => [12.005, 0, d]));
    expect(sources[0].stop).toHaveBeenCalled(); player.dispose();
  });
  it('restarts the entire excerpt and fades the final half second', async () => {
    const player = new WebAudioPlayer(); await player.load('/test.opus'); await player.playFrom(0);
    expect(sources[0].start).toHaveBeenCalledWith(12.005, 0, 40);
    expect(envelopes[1].gain.setValueAtTime).toHaveBeenCalledWith(1, 51.505);
    expect(envelopes[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 52.005); player.dispose();
  });
  it('ignores superseded loads and reports failed requests without caching the error', async () => {
    let finish!: (result: object) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url === '/slow' ? new Promise(r => { finish = r; }) : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
    const player = new WebAudioPlayer(); const slow = player.load('/slow'); await player.load('/next');
    finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }); await slow;
    await player.playClip(0, .1); expect(sources).toHaveLength(1); player.dispose();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const broken = new WebAudioPlayer(); await expect(broken.load('/missing')).rejects.toThrow('404'); await expect(broken.load('/missing')).rejects.toThrow('404');
    expect(fetch).toHaveBeenCalledTimes(2); broken.dispose();
  });
});
