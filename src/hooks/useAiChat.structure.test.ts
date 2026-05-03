import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HOOKS = path.resolve(process.cwd(), 'src/hooks');

function readUseAiChatCode() {
  return fs.readFileSync(path.join(HOOKS, 'useAiChat.ts'), 'utf8');
}

/** Main hook + send pipeline modules that carry streaming / persistence seams. */
function readUseAiChatSeamBundle() {
  const files = [
    'useAiChat.ts',
    'useAiChat.sendTurn.ts',
    'useAiChat.sendTurnPreflight.ts',
    'useAiChat.sendTurnPersistAndPrimaryStream.ts',
    'useAiChat.sendTurnCompletion.ts',
    'useAiChat.sendTurnCorrelation.ts',
    'useAiChat.sendTurnStreamPhase.ts',
    'useAiChat.sendPersistTurnAndBuildPromptContext.ts',
  ] as const;
  return files.map((f) => fs.readFileSync(path.join(HOOKS, f), 'utf8')).join('\n');
}

describe('useAiChat structure invariants', () => {
  it('keeps extracted helper seams for configuration and orchestration', () => {
    const code = readUseAiChatCode();
    const bundle = readUseAiChatSeamBundle();

    expect(code.includes("from './useAiChat.config';")).toBe(true);
    expect(code.includes("from './useAiChat.helpers';")).toBe(true);
    expect(bundle.includes("from './useAiChat.assistantPersistence';")).toBe(true);
    expect(code.includes("from './useAiChat.streamFactory';")).toBe(true);
    expect(bundle.includes("from './useAiChat.streamCompletion';")).toBe(true);
    expect(bundle.includes("from './useAiChat.streamCompletionPhase';")).toBe(true);
    expect(code.includes("from './useAiChat.rag';")).toBe(true);
    expect(code.includes("from './useAiChat.confirmExecution';")).toBe(true);
    expect(code.includes("from './useAiChat.agentLoopCheckpointControls';")).toBe(true);
    expect(bundle.includes("from './useAiChat.assistantDialogueSendGate';")).toBe(true);
    expect(code.includes("from './useAiChat.directiveSessionControls';")).toBe(true);
    expect(bundle.includes("from './useAiChat.sendPersistTurnAndBuildPromptContext';")).toBe(true);
    expect(code.includes("from './useAiChat.sendTurn';")).toBe(true);
  });

  it('keeps streaming, RAG enrichment and tool decision behind dedicated helpers', () => {
    const code = readUseAiChatCode();
    const bundle = readUseAiChatSeamBundle();

    expect(bundle.includes('createAssistantStream(')).toBe(true);
    expect(bundle.includes('createAssistantPersistenceHelpers(')).toBe(true);
    expect(code.includes('enrichContextWithRag')).toBe(true);
    expect(bundle.includes('finalizeAssistantStreamCompletion(')).toBe(true);
    expect(code.includes('executeConfirmedToolCall(')).toBe(true);
  });

  it('wires send-turn orchestration to preflight, persist/stream, and stream phase modules', () => {
    const sendTurn = fs.readFileSync(path.join(HOOKS, 'useAiChat.sendTurn.ts'), 'utf8');
    expect(sendTurn.includes("from './useAiChat.sendTurnPreflight'")).toBe(true);
    expect(sendTurn.includes("from './useAiChat.sendTurnPersistAndPrimaryStream'")).toBe(true);
    expect(sendTurn.includes("from './useAiChat.sendTurnCompletion'")).toBe(true);
    expect(sendTurn.includes("from './useAiChat.sendTurnStreamPhase'")).toBe(true);
    expect(sendTurn.includes("from './useAiChat.sendTurnCorrelation'")).toBe(true);
    expect(sendTurn.includes('logSendTurnPhase')).toBe(true);
    expect(sendTurn.includes("from '../i18n'")).toBe(true);
    expect(sendTurn.includes("tf(toolFeedbackLocaleRef.current, 'ai.chat.persistLayerRecoveryHint'")).toBe(true);
    const preflight = fs.readFileSync(path.join(HOOKS, 'useAiChat.sendTurnPreflight.ts'), 'utf8');
    expect(preflight.includes('correlationId')).toBe(true);
  });

  it('keeps provider orchestration and session memory anchored in hook boundaries', () => {
    const code = readUseAiChatCode();
    const sessionMemoryImportMatch = code.match(/import\s*\{([\s\S]*?)\}\s*from\s*'\.\.\/ai\/chat\/sessionMemory';/);
    const sessionMemoryImportMembers = sessionMemoryImportMatch?.[1] ?? '';

    expect(code.includes('const provider = useMemo(() => createAiChatProvider(settings), [settings]);')).toBe(true);
    expect(code.includes('const orchestrator = useMemo(() => new ChatOrchestrator(provider, fallbackProvider), [provider, fallbackProvider]);')).toBe(true);
    expect(code.includes('const sessionMemoryRef = useRef<AiSessionMemory>(loadSessionMemory());')).toBe(true);
    expect(sessionMemoryImportMembers.includes('loadSessionMemory')).toBe(true);
    expect(sessionMemoryImportMembers.includes('persistSessionMemory')).toBe(true);
    expect(code.includes('sessionMemory: sessionMemoryRef.current,')).toBe(true);
    expect(code.includes('persistSessionMemory,')).toBe(true);
  });
});
