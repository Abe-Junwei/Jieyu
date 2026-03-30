import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readUseVoiceAgentCode() {
  const filePath = path.resolve(process.cwd(), 'src/hooks/useVoiceAgent.ts');
  return fs.readFileSync(filePath, 'utf8');
}

function countMatches(code: string, pattern: RegExp): number {
  return Array.from(code.matchAll(pattern)).length;
}

describe('useVoiceAgent structure invariants', () => {
  it('keeps heavy voice runtimes behind lazy imports', () => {
    const code = readUseVoiceAgentCode();

    expect(code.includes("let voiceInputRuntimePromise: Promise<typeof import('../services/VoiceInputService')> | null = null;")).toBe(true);
    expect(code.includes("let wakeWordRuntimePromise: Promise<typeof import('../services/WakeWordDetector')> | null = null;")).toBe(true);
    expect(code.includes("voiceInputRuntimePromise = import('../services/VoiceInputService');")).toBe(true);
    expect(code.includes("wakeWordRuntimePromise = import('../services/WakeWordDetector');")).toBe(true);

    expect(code.includes("import { VoiceInputService } from '../services/VoiceInputService';")).toBe(false);
    expect(code.includes("import { WakeWordDetector } from '../services/WakeWordDetector';")).toBe(false);
  });

  it('keeps service instantiation centralized to one runtime entry per service', () => {
    const code = readUseVoiceAgentCode();

    expect(countMatches(code, /new VoiceInputService\(/g)).toBe(1);
    expect(countMatches(code, /new WakeWordDetector\(/g)).toBe(1);
    expect(code.includes('const serviceRef = useRef<VoiceInputServiceType | null>(null);')).toBe(true);
    expect(code.includes('const wakeWordDetectorRef = useRef<WakeWordDetectorType | null>(null);')).toBe(true);
  });

  it('keeps runtime cleanup centralized for both voice services', () => {
    const code = readUseVoiceAgentCode();

    expect(code.includes('serviceRef.current?.dispose();')).toBe(true);
    expect(code.includes('serviceRef.current = null;')).toBe(true);
    expect(code.includes('wakeWordDetectorRef.current?.stop();')).toBe(true);
    expect(code.includes('wakeWordDetectorRef.current = null;')).toBe(true);
  });
});