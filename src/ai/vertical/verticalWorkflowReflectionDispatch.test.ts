import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dispatchVerticalWorkflowReflection } from './verticalWorkflowReflectionDispatch';
import type { EvidencePacketV0 } from './evidencePacket';

const packet: EvidencePacketV0 = {
  schemaVersion: 0,
  id: 'ep-001',
  sourceType: 'segment',
  sourceId: 'seg-001',
  quote: 'sample quote',
  confidence: 0.8,
};

describe('dispatchVerticalWorkflowReflection', () => {
  it('routes segment_qa via registry handler and omits retry blob when checks pass', () => {
    const result = dispatchVerticalWorkflowReflection('segment_qa', 'This is correct [1].', [
      packet,
    ]);
    expect(result).not.toBeNull();
    expect(result!.auditField).toBe('ai_segment_qa_reflection');
    expect(result!.reflection.reflectionFlagged).toBe(false);
    expect(result!.retryBlob).toBeUndefined();
  });

  it('returns retry blob when annotation_qa reflection flags', () => {
    const result = dispatchVerticalWorkflowReflection('annotation_qa', 'A [1] B [2] C [3].', [
      packet,
    ]);
    expect(result!.reflection.reflectionFlagged).toBe(true);
    expect(result!.auditField).toBe('ai_annotation_qa_reflection');
    expect(result!.retryBlob?.kind).toBe('annotation_qa');
  });

  it('routes lexeme_candidates and elan_flex_compatibility', () => {
    const lexeme = dispatchVerticalWorkflowReflection(
      'lexeme_candidates',
      'Candidate [1]: lexeme "hello", pos: interj.',
      [packet],
    );
    expect(lexeme!.auditField).toBe('ai_lexeme_candidates_reflection');
    expect(lexeme!.reflection.reflectionFlagged).toBe(false);

    const elan = dispatchVerticalWorkflowReflection('elan_flex_compatibility', 'not a report', [
      packet,
    ]);
    expect(elan!.auditField).toBe('ai_elan_flex_compatibility_reflection');
    expect(elan!.reflection.reflectionFlagged).toBe(true);
    expect(elan!.retryBlob?.kind).toBe('elan_flex_compatibility');
  });

  it('finalize uses registry dispatch instead of a four-way workflowId if/else', () => {
    const finalizePath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../hooks/ai/useAiChat.sendTurnStreamPhase.completionPipelineVerticalFinalize.ts',
    );
    const src = readFileSync(finalizePath, 'utf8');
    expect(src).toContain('dispatchVerticalWorkflowReflection');
    expect(src).toContain("run('after_model'");
    expect(src).not.toContain('runSegmentQaReflection');
    expect(src).not.toContain('runAnnotationQaReflection');
    expect(src).not.toContain('runLexemeCandidatesReflection');
    expect(src).not.toContain('runElanFlexCompatibilityReflection');
  });
});
