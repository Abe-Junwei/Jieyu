import { describe, expect, it } from 'vitest';
import type { AiChatToolCall, AiPromptContext } from '../chat/chatDomain.types';
import { assertAiChatToolWriteAllowed, assertLocalContextToolAllowed } from './toolWriteGate';

const baseContext: AiPromptContext = {
  shortTerm: {
    activeSegmentUnitId: 'seg-1',
    selectedUnitKind: 'segment',
    selectedUnitIds: ['seg-1'],
    selectedLayerId: 'layer-1',
    selectedLayerType: 'transcription',
  },
};

describe('assertLocalContextToolAllowed', () => {
  it('allows readonly tools when gate is enabled', () => {
    const decision = assertLocalContextToolAllowed(
      { name: 'search_units', arguments: { query: 'test' } },
      baseContext,
      { gateEnabled: true },
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe('readonly_allowed');
  });

  it('blocks write_preview when context is missing', () => {
    const decision = assertLocalContextToolAllowed(
      { name: 'batch_apply', arguments: { action: 'verify', unitIds: ['seg-1'] } },
      null,
      { gateEnabled: true },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('context_unavailable');
    }
  });

  it('allows batch_apply preview when context exists', () => {
    const decision = assertLocalContextToolAllowed(
      { name: 'batch_apply', arguments: { action: 'verify', unitIds: ['seg-1'] } },
      baseContext,
      { gateEnabled: true },
    );
    expect(decision.allowed).toBe(true);
  });

  it('passes through when gate is disabled', () => {
    const decision = assertLocalContextToolAllowed({ name: 'batch_apply', arguments: {} }, null, {
      gateEnabled: false,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe('gate_disabled');
  });
});

describe('assertAiChatToolWriteAllowed', () => {
  it('allows readonly ai chat tools when gate is enabled', () => {
    const decision = assertAiChatToolWriteAllowed(
      { name: 'get_recent_history', arguments: {} } as AiChatToolCall,
      baseContext,
      { gateEnabled: true, destructiveAllowed: true },
    );
    expect(decision.allowed).toBe(true);
  });

  it('blocks write tools without resolvable target', () => {
    const decision = assertAiChatToolWriteAllowed(
      { name: 'set_transcription_text', arguments: { text: 'hello' } } as AiChatToolCall,
      { shortTerm: {} },
      { gateEnabled: true, destructiveAllowed: true },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('scope_target_unresolved');
    }
  });

  it('allows write tools with resolvable segment target', () => {
    const decision = assertAiChatToolWriteAllowed(
      { name: 'set_transcription_text', arguments: { text: 'hello' } } as AiChatToolCall,
      baseContext,
      { gateEnabled: true, destructiveAllowed: true },
    );
    expect(decision.allowed).toBe(true);
  });

  it('blocks destructive tools when destructive is denied', () => {
    const decision = assertAiChatToolWriteAllowed(
      { name: 'delete_transcription_segment', arguments: { segmentId: 'seg-1' } } as AiChatToolCall,
      baseContext,
      { gateEnabled: true, destructiveAllowed: false },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('destructive_denied');
    }
  });
});
