import { describe, expect, it } from 'vitest';
import { recordingStartFailureDictKey } from './useRecording';

describe('recordingStartFailureDictKey', () => {
  it('maps NotAllowedError to mic permission key', () => {
    expect(recordingStartFailureDictKey(new DOMException('Permission denied', 'NotAllowedError'))).toBe(
      'transcription.timeline.audio.error.micPermissionDenied',
    );
  });

  it('maps NotFoundError', () => {
    expect(recordingStartFailureDictKey(new DOMException('Requested device not found', 'NotFoundError'))).toBe(
      'transcription.timeline.audio.error.micNotFound',
    );
  });

  it('maps NotReadableError', () => {
    expect(recordingStartFailureDictKey(new DOMException('Could not start audio source', 'NotReadableError'))).toBe(
      'transcription.timeline.audio.error.micBusy',
    );
  });

  it('falls back to generic start failed', () => {
    expect(recordingStartFailureDictKey(new Error('network'))).toBe(
      'transcription.timeline.audio.error.startFailed',
    );
  });
});
