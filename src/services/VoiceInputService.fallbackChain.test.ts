import { describe, expect, it } from 'vitest';
import {
  buildSttFallbackChain,
  commercialSttMissingReason,
  COMMERCIAL_STT_NOT_CONFIGURED_REASON,
  formatSttAllEnginesFailedMessage,
  sliceSttFallbackChain,
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

  it('sliceSttFallbackChain starts at the given engine or falls back to full chain', () => {
    const chain: Array<'web-speech' | 'whisper-local' | 'commercial'> = [
      'web-speech',
      'whisper-local',
      'commercial',
    ];
    expect(sliceSttFallbackChain(chain, 'whisper-local')).toEqual(['whisper-local', 'commercial']);
    expect(sliceSttFallbackChain(chain, 'web-speech')).toEqual(chain);
    const noWebSpeech: Array<'whisper-local' | 'commercial'> = ['whisper-local', 'commercial'];
    expect(sliceSttFallbackChain(noWebSpeech, 'web-speech')).toEqual(['whisper-local', 'commercial']);
  });

  it('commercialSttMissingReason', () => {
    expect(commercialSttMissingReason(true)).toBeNull();
    expect(commercialSttMissingReason(false)).toBe(COMMERCIAL_STT_NOT_CONFIGURED_REASON);
  });
});
