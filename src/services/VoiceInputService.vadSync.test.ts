import { describe, expect, it } from 'vitest';
import { voiceInputShouldUseVadForEngine } from './VoiceInputService.vadSync';

describe('VoiceInputService.vadSync', () => {
  it('respects explicit vadEnabled false', () => {
    expect(
      voiceInputShouldUseVadForEngine({
        engine: 'whisper-local',
        vadEnabled: false,
        navigatorOnline: true,
      }),
    ).toBe(false);
  });

  it('respects explicit vadEnabled true', () => {
    expect(
      voiceInputShouldUseVadForEngine({
        engine: 'web-speech',
        vadEnabled: true,
        navigatorOnline: false,
      }),
    ).toBe(true);
  });

  it('whisper-local with undefined vadEnabled enables VAD even when offline', () => {
    expect(
      voiceInputShouldUseVadForEngine({
        engine: 'whisper-local',
        navigatorOnline: false,
      }),
    ).toBe(true);
  });

  it('web-speech offline without vadEnabled disables VAD', () => {
    expect(
      voiceInputShouldUseVadForEngine({
        engine: 'web-speech',
        navigatorOnline: false,
      }),
    ).toBe(false);
  });
});
