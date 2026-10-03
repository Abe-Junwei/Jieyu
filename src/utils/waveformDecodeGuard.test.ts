import { describe, expect, it } from 'vitest';
import {
  WAVEFORM_DECODE_MAX_BYTES,
  WAVEFORM_DECODE_MAX_DURATION_SEC,
  clearWaveformDecodeAttempt,
  isWaveformMediaTooLong,
  markWaveformDecodeAttempt,
  isWaveformDecodeForced,
  requestWaveformDecodeRetry,
  waveformDecodeBlockReason,
} from './waveformDecodeGuard';

describe('waveformDecodeGuard', () => {
  it('treats an over-long recording as too long to decode', () => {
    expect(isWaveformMediaTooLong({ durationSec: WAVEFORM_DECODE_MAX_DURATION_SEC + 1 })).toBe(
      true,
    );
    expect(isWaveformMediaTooLong({ byteSize: WAVEFORM_DECODE_MAX_BYTES + 1 })).toBe(true);
    expect(
      waveformDecodeBlockReason({
        mediaId: 'media-1',
        durationSec: WAVEFORM_DECODE_MAX_DURATION_SEC + 1,
      }),
    ).toBe('too-long');
  });

  it('does not auto-retry a media id whose last decode was interrupted', () => {
    markWaveformDecodeAttempt('media-1');
    expect(waveformDecodeBlockReason({ mediaId: 'media-1', durationSec: 10 })).toBe('crashed');
    expect(waveformDecodeBlockReason({ mediaId: 'media-1', durationSec: 10, force: true })).toBe(
      null,
    );
    clearWaveformDecodeAttempt('media-1');
    expect(waveformDecodeBlockReason({ mediaId: 'media-1', durationSec: 10 })).toBe(null);
  });

  it('keeps an explicit retry armed until the decode succeeds', () => {
    markWaveformDecodeAttempt('media-1');
    requestWaveformDecodeRetry('media-1');
    expect(isWaveformDecodeForced('media-1')).toBe(true);
    expect(waveformDecodeBlockReason({ mediaId: 'media-1', durationSec: 10, force: true })).toBe(
      null,
    );
    clearWaveformDecodeAttempt('media-1');
    expect(isWaveformDecodeForced('media-1')).toBe(false);
  });
});
