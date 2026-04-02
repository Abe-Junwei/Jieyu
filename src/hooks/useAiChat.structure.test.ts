import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readUseAiChatCode() {
  const filePath = path.resolve(process.cwd(), 'src/hooks/useAiChat.ts');
  return fs.readFileSync(filePath, 'utf8');
}

describe('useAiChat structure invariants', () => {
  it('keeps extracted helper seams for configuration and orchestration', () => {
    const code = readUseAiChatCode();

    expect(code.includes("from './useAiChat.config';")).toBe(true);
    expect(code.includes("from './useAiChat.helpers';")).toBe(true);
    expect(code.includes("from './useAiChat.assistantPersistence';")).toBe(true);
    expect(code.includes("from './useAiChat.streamFactory';")).toBe(true);
    expect(code.includes("from './useAiChat.streamCompletion';")).toBe(true);
    expect(code.includes("from './useAiChat.rag';")).toBe(true);
    expect(code.includes("from './useAiChat.confirmExecution';")).toBe(true);
  });

  it('keeps streaming, RAG enrichment and tool decision behind dedicated helpers', () => {
    const code = readUseAiChatCode();

    expect(code.includes('createAssistantStream(')).toBe(true);
    expect(code.includes('createAssistantPersistenceHelpers(')).toBe(true);
    expect(code.includes('enrichContextWithRag(')).toBe(true);
    expect(code.includes('resolveAiChatStreamCompletion(')).toBe(true);
    expect(code.includes('executeConfirmedToolCall(')).toBe(true);
  });

  it('keeps provider orchestration and session memory anchored in hook boundaries', () => {
    const code = readUseAiChatCode();

    expect(code.includes('const provider = useMemo(() => createAiChatProvider(settings), [settings]);')).toBe(true);
    expect(code.includes('const orchestrator = useMemo(() => new ChatOrchestrator(provider, fallbackProvider), [provider, fallbackProvider]);')).toBe(true);
    expect(code.includes('const sessionMemoryRef = useRef<AiSessionMemory>(loadSessionMemory());')).toBe(true);
    expect(code.includes("import { loadSessionMemory, persistSessionMemory } from '../ai/chat/sessionMemory';")).toBe(true);
    expect(code.includes('sessionMemory: sessionMemoryRef.current,')).toBe(true);
    expect(code.includes('persistSessionMemory,')).toBe(true);
  });
});
