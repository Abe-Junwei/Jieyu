import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_QA_THEN_LEXEME_CANDIDATES,
  SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES,
  advanceComposedWorkflowStateAfterParse,
  buildComposedReflectionRetryPromptAppendix,
  buildComposedWorkflowSystemPromptAppendix,
  buildStep2RetryPrompt,
  buildStep3RetryPrompt,
  createInitialComposedWorkflowState,
  parseComposedWorkflowOutput,
  resolveComposedStepWorkflowSelection,
  selectComposedWorkflowTemplate,
  stripComposedPendingReflectionRetry,
} from './composedWorkflowTemplates';
import { getVerticalWorkflowV0 } from './verticalWorkflowRegistry';

describe('selectComposedWorkflowTemplate', () => {
  it('returns null for empty text', () => {
    expect(selectComposedWorkflowTemplate('')).toBeNull();
    expect(selectComposedWorkflowTemplate('   ')).toBeNull();
  });

  it('matches Chinese composed keyword', () => {
    const result = selectComposedWorkflowTemplate('请审校并生成候选词');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('annotation_qa_then_lexeme_candidates');
  });

  it('matches another Chinese variant', () => {
    const result = selectComposedWorkflowTemplate('帮我检查标注并建议词条');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('annotation_qa_then_lexeme_candidates');
  });

  it('matches English composed keyword', () => {
    const result = selectComposedWorkflowTemplate('Run annotation qa then lexeme analysis');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('annotation_qa_then_lexeme_candidates');
  });

  it('returns null for unrelated text', () => {
    expect(selectComposedWorkflowTemplate('今天天气怎么样')).toBeNull();
    expect(selectComposedWorkflowTemplate('segment_qa')).toBeNull();
  });

  it('matches three-step Chinese keyword', () => {
    const result = selectComposedWorkflowTemplate('语段问答并审校生成候选词');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('segment_qa_then_annotation_qa_then_lexeme_candidates');
  });

  it('matches three-step English keyword', () => {
    const result = selectComposedWorkflowTemplate('Run segment qa then annotation then lexeme');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('segment_qa_then_annotation_qa_then_lexeme_candidates');
  });
});

describe('buildComposedWorkflowSystemPromptAppendix', () => {
  it('includes step1 and step2 instructions for stepIndex 0', () => {
    const appendix = buildComposedWorkflowSystemPromptAppendix(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 0);
    expect(appendix).toContain('Step 1: Annotation QA');
    expect(appendix).toContain('Step 2: Lexeme Candidates');
    expect(appendix).toContain('<step1>');
    expect(appendix).toContain('<step2>');
  });

  it('includes step1 result and step2-only instructions for stepIndex 1', () => {
    const step1Result = 'Found 3 annotation issues.';
    const appendix = buildComposedWorkflowSystemPromptAppendix(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 1, step1Result);
    expect(appendix).toContain('Previous Step 1 Result');
    expect(appendix).toContain(step1Result);
    expect(appendix).toContain('<step2>');
    expect(appendix).not.toContain('<step1>');
  });

  it('returns empty string for unknown template', () => {
    const appendix = buildComposedWorkflowSystemPromptAppendix({ id: 'unknown', labelKey: '', steps: [], keywords: [] } as unknown as typeof ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 0);
    expect(appendix).toBe('');
  });

  it('includes three steps for three-step template at stepIndex 0', () => {
    const appendix = buildComposedWorkflowSystemPromptAppendix(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 0);
    expect(appendix).toContain('Step 1: Segment QA');
    expect(appendix).toContain('Step 2: Annotation QA');
    expect(appendix).toContain('Step 3: Lexeme Candidates');
    expect(appendix).toContain('<step1>');
    expect(appendix).toContain('<step2>');
    expect(appendix).toContain('<step3>');
  });

  it('includes step1 result and step2+3 instructions for three-step stepIndex 1', () => {
    const step1Result = 'Segment answer.';
    const appendix = buildComposedWorkflowSystemPromptAppendix(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 1, step1Result);
    expect(appendix).toContain('Previous Step 1 Result');
    expect(appendix).toContain(step1Result);
    expect(appendix).toContain('<step2>');
    expect(appendix).toContain('<step3>');
    expect(appendix).not.toContain('<step1>');
  });

  it('includes step1+2 results and step3 instructions for three-step stepIndex 2', () => {
    const step1Result = 'Segment answer.';
    const step2Result = 'Annotation findings.';
    const appendix = buildComposedWorkflowSystemPromptAppendix(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 2, step1Result, step2Result);
    expect(appendix).toContain('Previous Step 1 Result');
    expect(appendix).toContain(step1Result);
    expect(appendix).toContain('Previous Step 2 Result');
    expect(appendix).toContain(step2Result);
    expect(appendix).toContain('<step3>');
    expect(appendix).not.toContain('<step1>');
    expect(appendix).not.toContain('<step2>');
  });
});

describe('parseComposedWorkflowOutput', () => {
  it('parses valid two-step output', () => {
    const content = 'Some intro\n<step1>\nIssue A\nIssue B\n</step1>\n<step2>\nLemma1: noun\n</step2>\nFooter';
    const result = parseComposedWorkflowOutput(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, content);
    expect(result).not.toBeNull();
    expect(result!.step1).toBe('Issue A\nIssue B');
    expect(result!.step2).toBe('Lemma1: noun');
  });

  it('returns null when step1 tag is missing', () => {
    const content = '<step2>\nOnly step2\n</step2>';
    expect(parseComposedWorkflowOutput(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, content)).toBeNull();
  });

  it('returns null when step2 tag is missing', () => {
    const content = '<step1>\nOnly step1\n</step1>';
    expect(parseComposedWorkflowOutput(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, content)).toBeNull();
  });

  it('returns null when step1 is empty', () => {
    const content = '<step1>   </step1>\n<step2>Valid</step2>';
    expect(parseComposedWorkflowOutput(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, content)).toBeNull();
  });

  it('returns null when step2 is empty', () => {
    const content = '<step1>Valid</step1>\n<step2>   </step2>';
    expect(parseComposedWorkflowOutput(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, content)).toBeNull();
  });

  it('parses valid three-step output', () => {
    const content = '<step1>A</step1>\n<step2>B</step2>\n<step3>C</step3>';
    const result = parseComposedWorkflowOutput(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, content);
    expect(result).not.toBeNull();
    expect(result!.step1).toBe('A');
    expect(result!.step2).toBe('B');
    expect(result!.step3).toBe('C');
  });

  it('returns null for three-step when step3 is missing', () => {
    const content = '<step1>A</step1>\n<step2>B</step2>';
    expect(parseComposedWorkflowOutput(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, content)).toBeNull();
  });

  it('returns null for three-step when step3 is empty', () => {
    const content = '<step1>A</step1>\n<step2>B</step2>\n<step3>   </step3>';
    expect(parseComposedWorkflowOutput(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, content)).toBeNull();
  });
});

describe('stripComposedPendingReflectionRetry', () => {
  it('removes pending reflection retry markers', () => {
    const s = {
      ...createInitialComposedWorkflowState(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'q'),
      pendingReflectionRetryStepIndex: 0,
      pendingReflectionRetryDetail: {
        kind: 'segment_qa' as const,
        result: {
          reflectionFlagged: true,
          checks: [{ name: 'citation_count_match', passed: false, detail: 'd' }],
          summary: 'x',
        },
      },
    };
    const stripped = stripComposedPendingReflectionRetry(s);
    expect(stripped.pendingReflectionRetryStepIndex).toBeUndefined();
    expect(stripped.pendingReflectionRetryDetail).toBeUndefined();
    expect(stripped.templateId).toBe(s.templateId);
  });
});

describe('buildComposedReflectionRetryPromptAppendix', () => {
  it('returns guidance for flagged segment_qa reflection', () => {
    const appendix = buildComposedReflectionRetryPromptAppendix({
      kind: 'segment_qa',
      result: {
        reflectionFlagged: true,
        checks: [{ name: 'citation_count_match', passed: false, detail: 'mismatch' }],
        summary: 'flagged',
      },
    });
    expect(appendix.length).toBeGreaterThan(0);
    expect(appendix).toMatch(/citation|Citation/i);
  });
});

describe('buildStep2RetryPrompt', () => {
  it('returns a short Chinese retry cue', () => {
    const prompt = buildStep2RetryPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Step 2');
  });
});

describe('buildStep3RetryPrompt', () => {
  it('returns a short Chinese retry cue', () => {
    const prompt = buildStep3RetryPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Step 3');
  });
});

describe('createInitialComposedWorkflowState', () => {
  it('creates running state at step 0', () => {
    const state = createInitialComposedWorkflowState(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'user query');
    expect(state.templateId).toBe('annotation_qa_then_lexeme_candidates');
    expect(state.currentStepIndex).toBe(0);
    expect(state.status).toBe('running');
    expect(state.originalUserText).toBe('user query');
    expect(Object.keys(state.stepResults)).toHaveLength(0);
  });
});

describe('advanceComposedWorkflowStateAfterParse', () => {
  const baseState = createInitialComposedWorkflowState(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'user query');

  it('advances to done when both steps parsed', () => {
    const parseResult = { step1: 'Findings', step2: 'Candidates' };
    const { nextState, step1Result, step2Result } = advanceComposedWorkflowStateAfterParse(baseState, parseResult, 'raw');
    expect(nextState.status).toBe('done');
    expect(nextState.currentStepIndex).toBe(2);
    expect(step1Result).toBe('Findings');
    expect(step2Result).toBe('Candidates');
  });

  it('clears pending reflection retry markers on successful parse', () => {
    const stateWithPending = {
      ...baseState,
      pendingReflectionRetryStepIndex: 0,
      pendingReflectionRetryDetail: {
        kind: 'annotation_qa' as const,
        result: {
          reflectionFlagged: true,
          checks: [{ name: 'citation_count_match', passed: false, detail: 'd' }],
          summary: 's',
        },
      },
    };
    const parseResult = { step1: 'Findings', step2: 'Candidates' };
    const { nextState } = advanceComposedWorkflowStateAfterParse(stateWithPending, parseResult, 'raw');
    expect(nextState.pendingReflectionRetryStepIndex).toBeUndefined();
    expect(nextState.pendingReflectionRetryDetail).toBeUndefined();
  });

  it('advances to step1_done when only step1 is present', () => {
    const raw = '<step1>Findings only</step1>';
    const { nextState, step1Result, step2Result } = advanceComposedWorkflowStateAfterParse(baseState, null, raw);
    expect(nextState.status).toBe('step1_done');
    expect(nextState.currentStepIndex).toBe(1);
    expect(step1Result).toBe('Findings only');
    expect(step2Result).toBeNull();
  });

  it('marks failed when neither step is present', () => {
    const raw = 'No tags at all';
    const { nextState, step1Result, step2Result } = advanceComposedWorkflowStateAfterParse(baseState, null, raw);
    expect(nextState.status).toBe('failed');
    expect(step1Result).toBeNull();
    expect(step2Result).toBeNull();
  });

  it('marks failed when step1 tag is empty', () => {
    const raw = '<step1>   </step1>';
    const { nextState } = advanceComposedWorkflowStateAfterParse(baseState, null, raw);
    expect(nextState.status).toBe('failed');
  });

  describe('three-step template', () => {
    const threeState = createInitialComposedWorkflowState(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'user query');

    it('advances to done when all three steps parsed', () => {
      const parseResult = { step1: 'A', step2: 'B', step3: 'C' };
      const { nextState, step1Result, step2Result, step3Result } = advanceComposedWorkflowStateAfterParse(threeState, parseResult, 'raw');
      expect(nextState.status).toBe('done');
      expect(nextState.currentStepIndex).toBe(3);
      expect(step1Result).toBe('A');
      expect(step2Result).toBe('B');
      expect(step3Result).toBe('C');
    });

    it('advances to step2_done when step1+2 present but step3 missing', () => {
      const raw = '<step1>A</step1>\n<step2>B</step2>';
      const { nextState, step1Result, step2Result, step3Result } = advanceComposedWorkflowStateAfterParse(threeState, null, raw);
      expect(nextState.status).toBe('step2_done');
      expect(nextState.currentStepIndex).toBe(2);
      expect(step1Result).toBe('A');
      expect(step2Result).toBe('B');
      expect(step3Result).toBeNull();
    });

    it('advances to step1_done when only step1 present', () => {
      const raw = '<step1>A</step1>';
      const { nextState, step1Result, step2Result, step3Result } = advanceComposedWorkflowStateAfterParse(threeState, null, raw);
      expect(nextState.status).toBe('step1_done');
      expect(nextState.currentStepIndex).toBe(1);
      expect(step1Result).toBe('A');
      expect(step2Result).toBeNull();
      expect(step3Result).toBeNull();
    });
  });
});

describe('resolveComposedStepWorkflowSelection', () => {
  it('returns annotation_qa for step 0', () => {
    const state = createInitialComposedWorkflowState(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'query');
    const selection = resolveComposedStepWorkflowSelection(state);
    expect(selection).not.toBeNull();
    expect(selection!.workflowId).toBe('annotation_qa');
    expect(selection!.workflow).toEqual(getVerticalWorkflowV0('annotation_qa'));
  });

  it('returns lexeme_candidates for step1_done status', () => {
    const state = {
      ...createInitialComposedWorkflowState(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'query'),
      currentStepIndex: 1,
      status: 'step1_done' as const,
    };
    const selection = resolveComposedStepWorkflowSelection(state);
    expect(selection).not.toBeNull();
    expect(selection!.workflowId).toBe('lexeme_candidates');
  });

  it('returns null for done status', () => {
    const state = {
      ...createInitialComposedWorkflowState(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'query'),
      status: 'done' as const,
      currentStepIndex: 2,
    };
    expect(resolveComposedStepWorkflowSelection(state)).toBeNull();
  });

  it('returns null for failed status', () => {
    const state = {
      ...createInitialComposedWorkflowState(ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'query'),
      status: 'failed' as const,
    };
    expect(resolveComposedStepWorkflowSelection(state)).toBeNull();
  });

  describe('three-step template', () => {
    it('returns segment_qa for step 0', () => {
      const state = createInitialComposedWorkflowState(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'query');
      const selection = resolveComposedStepWorkflowSelection(state);
      expect(selection).not.toBeNull();
      expect(selection!.workflowId).toBe('segment_qa');
    });

    it('returns annotation_qa for step1_done status', () => {
      const state = {
        ...createInitialComposedWorkflowState(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'query'),
        currentStepIndex: 1,
        status: 'step1_done' as const,
      };
      const selection = resolveComposedStepWorkflowSelection(state);
      expect(selection).not.toBeNull();
      expect(selection!.workflowId).toBe('annotation_qa');
    });

    it('returns lexeme_candidates for step2_done status', () => {
      const state = {
        ...createInitialComposedWorkflowState(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'query'),
        currentStepIndex: 2,
        status: 'step2_done' as const,
      };
      const selection = resolveComposedStepWorkflowSelection(state);
      expect(selection).not.toBeNull();
      expect(selection!.workflowId).toBe('lexeme_candidates');
    });

    it('returns null for done status', () => {
      const state = {
        ...createInitialComposedWorkflowState(SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES, 'query'),
        status: 'done' as const,
        currentStepIndex: 3,
      };
      expect(resolveComposedStepWorkflowSelection(state)).toBeNull();
    });
  });
});
