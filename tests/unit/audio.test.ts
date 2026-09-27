import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from '../../src/client/adventure/audio.js';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('audio resource lifetime', () => {
  it('does not create a music interval after teardown while resume is pending', async () => {
    vi.useFakeTimers();
    let resume!: () => void;
    const close = vi.fn(async () => {});
    vi.stubGlobal(
      'AudioContext',
      class {
        resume() {
          return new Promise<void>((resolve) => {
            resume = resolve;
          });
        }
        close = close;
      },
    );
    const audio = new GameAudio('meadow');
    const pending = audio.unlock();
    audio.destroy();
    resume();
    await pending;
    expect(close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('suspends, resumes and closes once without creating duplicate music timers', async () => {
    vi.useFakeTimers();
    const suspend = vi.fn(async () => {}),
      resume = vi.fn(async () => {}),
      close = vi.fn(async () => {});
    vi.stubGlobal(
      'AudioContext',
      class {
        suspend = suspend;
        resume = resume;
        close = close;
        state = 'suspended';
      },
    );
    const audio = new GameAudio('none');
    await audio.unlock();
    await audio.unlock();
    expect(vi.getTimerCount()).toBe(1);
    audio.pause(true);
    audio.pause(false);
    audio.cue('jump');
    vi.advanceTimersByTime(1000);
    expect(suspend).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledTimes(3);
    audio.destroy();
    audio.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(close).toHaveBeenCalledOnce();
  });
});
it('honours music/effect switches and schedules bounded original tones with cleanup', async () => {
  vi.useFakeTimers();
  const starts: number[] = [],
    stops: number[] = [],
    disconnect = vi.fn();
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      currentTime = 10;
      destination = {};
      async resume() {}
      async close() {}
      createOscillator() {
        return {
          type: 'sine',
          frequency: { value: 0 },
          connect() {},
          disconnect,
          start(at: number) {
            starts.push(at);
          },
          stop(at: number) {
            stops.push(at);
          },
          onended: undefined,
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
          disconnect,
        };
      }
    },
  );
  const audio = new GameAudio('meadow');
  await audio.unlock();
  vi.advanceTimersByTime(1000);
  expect(starts).toHaveLength(0);
  audio.effects = false;
  audio.cue('win');
  expect(starts).toHaveLength(0);
  audio.effects = true;
  for (const cue of ['win', 'collect', 'recover', 'jump', 'arrive'] as const) audio.cue(cue);
  expect(starts).toHaveLength(11);
  expect(stops.every((at, i) => at > starts[i] && at - starts[i] < 2)).toBe(true);
  audio.music = true;
  vi.advanceTimersByTime(840);
  expect(starts.length).toBeGreaterThan(11);
  audio.destroy();
  expect(vi.getTimerCount()).toBe(0);
  const night = new GameAudio('night');
  await night.unlock();
  night.music = true;
  vi.advanceTimersByTime(420);
  night.destroy();
});
