import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readUseVoiceAgentCode() {
  const filePath = path.resolve(process.cwd(), 'src/hooks/useVoiceAgent.ts');
  return fs.readFileSync(filePath, 'utf8');
}

function readUseVoiceAgentRuntimeCode() {
  const filePath = path.resolve(process.cwd(), 'src/hooks/useVoiceAgent.runtime.ts');
  return fs.readFileSync(filePath, 'utf8');
}

function readUseVoiceAgentWakeWordCode() {
  const filePath = path.resolve(process.cwd(), 'src/hooks/useVoiceAgentWakeWord.ts');
  return fs.readFileSync(filePath, 'utf8');
}

function readUseVoiceAgentStartControllerCode() {
  const filePath = path.resolve(process.cwd(), 'src/hooks/useVoiceAgentStartController.ts');
  return fs.readFileSync(filePath, 'utf8');
}

function countMatches(code: string, pattern: RegExp): number {
  return Array.from(code.matchAll(pattern)).length;
}

describe('useVoiceAgent structure invariants', () => {
  it('keeps heavy voice runtimes behind lazy imports', () => {
    const code = readUseVoiceAgentCode();
    const runtimeCode = readUseVoiceAgentRuntimeCode();

    expect(runtimeCode.includes("let voiceInputRuntimePromise: Promise<typeof import('../services/VoiceInputService')> | null = null;")).toBe(true);
    expect(runtimeCode.includes("let wakeWordRuntimePromise: Promise<typeof import('../services/WakeWordDetector')> | null = null;")).toBe(true);
    expect(runtimeCode.includes("voiceInputRuntimePromise = import('../services/VoiceInputService');")).toBe(true);
    expect(runtimeCode.includes("wakeWordRuntimePromise = import('../services/WakeWordDetector');")).toBe(true);
    expect(code.includes('loadVoiceInputRuntime')).toBe(true);

    expect(code.includes("import { VoiceInputService } from '../services/VoiceInputService';")).toBe(false);
    expect(code.includes("import { WakeWordDetector } from '../services/WakeWordDetector';")).toBe(false);
  });

  it('keeps service instantiation centralized to one runtime entry per service', () => {
    const code = readUseVoiceAgentCode();
    const wakeWordCode = readUseVoiceAgentWakeWordCode();
    const startControllerCode = readUseVoiceAgentStartControllerCode();

    expect(countMatches(startControllerCode, /new VoiceInputService\(/g)).toBe(1);
    expect(countMatches(wakeWordCode, /new WakeWordDetector\(/g)).toBe(1);
    expect(code.includes('const serviceRef = useRef<VoiceInputServiceType | null>(null);')).toBe(true);
    expect(code.includes('const wakeWordDetectorRef = useRef<WakeWordDetectorType | null>(null);')).toBe(true);
    expect(code.includes("import { useVoiceAgentWakeWord } from './useVoiceAgentWakeWord';")).toBe(true);
    expect(code.includes("import { useVoiceAgentStartController } from './useVoiceAgentStartController';")).toBe(true);
  });

  it('keeps runtime cleanup centralized for both voice services', () => {
    const code = readUseVoiceAgentCode();
    const startControllerCode = readUseVoiceAgentStartControllerCode();

    expect(code.includes('const voiceActivateGenerationRef = useRef(0);')).toBe(true);
    expect(code.includes('const exclusiveStartPromiseRef = useRef<Promise<void> | null>(null);')).toBe(true);
    expect(startControllerCode.includes('function abortStaleMicStart(')).toBe(true);
    expect(startControllerCode.includes('exclusiveStartPromiseRef.current')).toBe(true);

    expect(code.includes('serviceRef.current?.dispose();')).toBe(true);
    expect(code.includes('serviceRef.current = null;')).toBe(true);
    expect(code.includes('wakeWordDetectorRef.current?.stop();')).toBe(true);
    expect(code.includes('wakeWordDetectorRef.current = null;')).toBe(true);
  });
});
