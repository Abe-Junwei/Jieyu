import { describe, expect, it } from 'vitest';
import {
  buildSttFallbackChain,
  formatSttAllEnginesFailedMessage,
  sttEngineUiLabel,
} from './VoiceInputService.fallbackChain';

describe('VoiceInputService.fallbackChain', () => {
  it('orders non-CN chain web-speech first', () => {
    expect(buildSttFallbackChain(undefined)).toEqual(['web-speech', 'whisper-local', 'commercial']);
    expect(buildSttFallbackChain('global')).toEqual(['web-speech', 'whisper-local', 'commercial']);
  });

  it('orders CN chain commercial first', () => {
    expect(buildSttFallbackChain('cn')).toEqual(['commercial', 'whisper-local', 'web-speech']);
  });

  it('sttEngineUiLabel covers all engines', () => {
    expect(sttEngineUiLabel('web-speech')).toContain('Web Speech');
    expect(sttEngineUiLabel('whisper-local')).toContain('Whisper');
    expect(sttEngineUiLabel('commercial')).toBeTruthy();
  });

  it('formatSttAllEnginesFailedMessage lists reasons', () => {
    const msg = formatSttAllEnginesFailedMessage(
      ['web-speech', 'whisper-local'],
      { 'web-speech': 'no ctor', 'whisper-local': 'down' },
    );
    expect(msg).toContain('STT');
    expect(msg).toContain('no ctor');
    expect(msg).toContain('down');
  });
});
