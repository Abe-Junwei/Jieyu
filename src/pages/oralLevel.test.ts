/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchLevel } from './oralLevel';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('watchLevel', () => {
  it('resumes the audio context so the meter is not stuck silent', () => {
    const resume = vi.fn(async () => undefined);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.stubGlobal(
      'AudioContext',
      class {
        resume = resume;
        createMediaStreamSource() {
          return { connect() {}, disconnect() {} };
        }
        createAnalyser() {
          return { fftSize: 0, getByteTimeDomainData() {} };
        }
        close() {
          return Promise.resolve();
        }
      },
    );
    const stop = watchLevel({} as MediaStream, () => undefined);
    expect(resume).toHaveBeenCalledTimes(1);
    stop();
  });
});
