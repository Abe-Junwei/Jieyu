import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readVoiceAgentServiceCode() {
  const filePath = path.resolve(process.cwd(), 'src/services/VoiceAgentService.ts');
  return fs.readFileSync(filePath, 'utf8');
}

function countMatches(code: string, pattern: RegExp): number {
  return Array.from(code.matchAll(pattern)).length;
}

describe('VoiceAgentService structure invariants', () => {
  it('keeps heavy voice runtimes behind lazy imports', () => {
    const code = readVoiceAgentServiceCode();

    expect(code.includes("let voiceInputRuntimePromise: Promise<typeof import('./VoiceInputService')> | null = null;")).toBe(true);
    expect(code.includes("let wakeWordRuntimePromise: Promise<typeof import('./WakeWordDetector')> | null = null;")).toBe(true);
    expect(code.includes("voiceInputRuntimePromise = import('./VoiceInputService');")).toBe(true);
    expect(code.includes("wakeWordRuntimePromise = import('./WakeWordDetector');")).toBe(true);

    expect(code.includes("import { VoiceInputService } from './VoiceInputService';")).toBe(false);
    expect(code.includes("import { WakeWordDetector } from './WakeWordDetector';")).toBe(false);
  });

  it('keeps runtime service instantiation centralized to one entry per service', () => {
    const code = readVoiceAgentServiceCode();

    expect(countMatches(code, /new VoiceInputService\(/g)).toBe(1);
    expect(countMatches(code, /new WakeWordDetector\(/g)).toBe(1);
    expect(code.includes('private _voiceService: VoiceInputServiceType | null = null;')).toBe(true);
    expect(code.includes('private _wakeWordDetector: WakeWordDetectorType | null = null;')).toBe(true);
  });

  it('keeps session restore and persistence lifecycle anchored in service boundaries', () => {
    const code = readVoiceAgentServiceCode();

    expect(code.includes('void loadRecentVoiceSessions(1).then(([recent]) => {')).toBe(true);
    expect(code.includes("document.addEventListener('visibilitychange', this._handleVisibilityChange);")).toBe(true);
    expect(code.includes("void saveVoiceSession(this._session).catch((err) => { log.error('failed to persist session', { err }); });")).toBe(true);
    expect(code.includes("void saveVoiceSession(this._session).catch((err) => { log.error('failed to persist session on deactivate', { err }); });")).toBe(true);
  });

  it('keeps cleanup and singleton replacement centralized', () => {
    const code = readVoiceAgentServiceCode();

    expect(code.includes("document.removeEventListener('visibilitychange', this._handleVisibilityChange);")).toBe(true);
    expect(code.includes('this._ambientUnsubscribe?.();')).toBe(true);
    expect(code.includes('this._voiceService?.dispose();')).toBe(true);
    expect(code.includes('this._voiceService?.releaseSharedAnalysisStream();')).toBe(true);
    expect(code.includes('this._stopWakeWordDetector();')).toBe(true);
    expect(code.includes('this.removeAllListeners();')).toBe(true);
    expect(code.includes('if (_instance) {')).toBe(true);
    expect(code.includes('_instance.dispose();')).toBe(true);
    expect(code.includes('_instance = new VoiceAgentService(options);')).toBe(true);
  });
});