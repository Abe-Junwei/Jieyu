import { describe, expect, it } from 'vitest';
import { buildVerticalWorkflowOutputEnvelopeV0, selectVerticalWorkflowV0 } from './verticalWorkflowSelection';

describe('verticalWorkflowSelection', () => {
  it('selects annotation_qa when text contains QA-style annotation keywords', () => {
    const selection = selectVerticalWorkflowV0('请帮我做这批语段的标注一致性 QA 检查');
    expect(selection?.workflowId).toBe('annotation_qa');
    expect(selection?.source).toBe('rule_v0');
    expect(selection?.reasonCode).toBe('keyword_match');
  });

  it('selects lexeme_candidates when text contains lexeme dictionary keywords', () => {
    const selection = selectVerticalWorkflowV0('基于这些语段给我生成词典候选 lexeme');
    expect(selection?.workflowId).toBe('lexeme_candidates');
  });

  it('selects segment_qa when text contains segment QA keywords', () => {
    const selection = selectVerticalWorkflowV0('解释一下这句语段是什么意思');
    expect(selection?.workflowId).toBe('segment_qa');
  });

  it('returns null when no keyword matches', () => {
    expect(selectVerticalWorkflowV0('今天天气不错')).toBeNull();
  });

  it('builds output envelope using selection workflow boundaries', () => {
    const selection = selectVerticalWorkflowV0('请做标注 QA');
    expect(selection).not.toBeNull();
    const envelope = buildVerticalWorkflowOutputEnvelopeV0(selection!);
    expect(envelope.schemaVersion).toBe(0);
    expect(envelope.workflowId).toBe('annotation_qa');
    expect(envelope.writeMode).toBe('propose_only');
    expect(envelope.outputKind).toBe('qa_findings');
    expect(Array.isArray(envelope.evidencePackets)).toBe(true);
    expect(typeof envelope.generatedAt).toBe('string');
  });
});
