import { getVerticalWorkflowV0, type VerticalWorkflowId, type VerticalWorkflowV0 } from './verticalWorkflowRegistry';
import type { AnnotationQaReflectionResult } from './annotationQaReflection';
import { buildAnnotationQaReflectionRetryPrompt } from './annotationQaReflection';
import type { LexemeCandidatesReflectionResult } from './lexemeCandidatesReflection';
import { buildLexemeCandidatesReflectionRetryPrompt } from './lexemeCandidatesReflection';
import type { SegmentQaReflectionResult } from './segmentQaReflection';
import { buildReflectionRetryPrompt as buildSegmentQaReflectionRetryPrompt } from './segmentQaReflection';
import type { ElanFlexCompatibilityReflectionResult } from './elanFlexCompatibilityWorkflow';
import { buildElanFlexCompatibilityReflectionRetryPrompt } from './elanFlexCompatibilityWorkflow';

type ComposedWorkflowStepId = 'segment_qa' | 'annotation_qa' | 'lexeme_candidates';

export interface ComposedWorkflowTemplate {
  id: string;
  labelKey: string;
  steps: readonly ComposedWorkflowStepId[];
  keywords: readonly string[];
}

export type ComposedWorkflowStatus = 'running' | 'step1_done' | 'step2_done' | 'done' | 'failed';

export type ComposedReflectionRetryBlob =
  | { kind: 'segment_qa'; result: SegmentQaReflectionResult }
  | { kind: 'annotation_qa'; result: AnnotationQaReflectionResult }
  | { kind: 'lexeme_candidates'; result: LexemeCandidatesReflectionResult }
  | { kind: 'elan_flex_compatibility'; result: ElanFlexCompatibilityReflectionResult };

export interface ComposedWorkflowState {
  templateId: string;
  currentStepIndex: number;
  stepResults: Record<string, string>;
  status: ComposedWorkflowStatus;
  originalUserText: string;
  /** P4: Track reflection retry counts per step (max 1 retry) */
  stepReflectionRetryCounts?: Record<number, number>;
  /** P4: When reflection flags a step, this holds the step index to retry */
  pendingReflectionRetryStepIndex?: number;
  /** Full reflection payload for one retry userText appendix (cleared after retry send). */
  pendingReflectionRetryDetail?: ComposedReflectionRetryBlob;
}

/** Drop pending reflection retry markers so a successful parse does not carry stale blobs. */
export function stripComposedPendingReflectionRetry(state: ComposedWorkflowState): ComposedWorkflowState {
  const { pendingReflectionRetryStepIndex: _a, pendingReflectionRetryDetail: _b, ...rest } = state;
  return rest;
}

export function buildComposedReflectionRetryPromptAppendix(detail: ComposedReflectionRetryBlob): string {
  switch (detail.kind) {
    case 'segment_qa':
      return buildSegmentQaReflectionRetryPrompt(detail.result);
    case 'annotation_qa':
      return buildAnnotationQaReflectionRetryPrompt(detail.result);
    case 'lexeme_candidates':
      return buildLexemeCandidatesReflectionRetryPrompt(detail.result);
    case 'elan_flex_compatibility':
      return buildElanFlexCompatibilityReflectionRetryPrompt(detail.result);
  }
}

export const ANNOTATION_QA_THEN_LEXEME_CANDIDATES: ComposedWorkflowTemplate = {
  id: 'annotation_qa_then_lexeme_candidates',
  labelKey: 'msg.ai.vertical.composed.annotationQaThenLexemeCandidates',
  steps: ['annotation_qa', 'lexeme_candidates'] as const,
  keywords: ['审校并生成候选词', '检查标注并建议词条', 'annotation qa then lexeme', 'qa and lexeme'],
};

export const SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES: ComposedWorkflowTemplate = {
  id: 'segment_qa_then_annotation_qa_then_lexeme_candidates',
  labelKey: 'msg.ai.vertical.composed.segmentQaThenAnnotationQaThenLexemeCandidates',
  steps: ['segment_qa', 'annotation_qa', 'lexeme_candidates'] as const,
  keywords: [
    '语段问答并审校生成候选词',
    '先问答再审校并建议词条',
    'segment qa then annotation then lexeme',
    'qa annotate lexeme',
  ],
};

const COMPOSED_WORKFLOW_TEMPLATES: readonly ComposedWorkflowTemplate[] = [
  ANNOTATION_QA_THEN_LEXEME_CANDIDATES,
  SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES,
];

/**
 * Select a composed workflow template if the user text matches any template keywords.
 * Checks composed templates before single-workflow selection so that composite
 * keywords take precedence.
 */
export function selectComposedWorkflowTemplate(userText: string): ComposedWorkflowTemplate | null {
  const normalized = userText.trim().toLowerCase();
  if (normalized.length === 0) return null;

  for (const template of COMPOSED_WORKFLOW_TEMPLATES) {
    const matched = template.keywords.find((kw) => normalized.includes(kw.toLowerCase()));
    if (matched) return template;
  }
  return null;
}

/**
 * Build the system-prompt appendix that instructs the model to perform
 * the composed workflow in a single turn. The appendix includes explicit
 * step boundaries so the output can be parsed deterministically.
 *
 * For step2 retry, the appendix references the cached step1 result so the
 * model does not need to re-derive it (token-saving).
 */
export function buildComposedWorkflowSystemPromptAppendix(
  template: ComposedWorkflowTemplate,
  stepIndex: number,
  previousStepResult?: string,
  previousStep2Result?: string,
): string {
  if (template.id === 'annotation_qa_then_lexeme_candidates') {
    if (stepIndex === 0) {
      return [
        'You are executing a two-step composed workflow in a single response.',
        '',
        '## Step 1: Annotation QA',
        'Review the selected annotations for consistency, completeness, and correctness.',
        'Report any issues found.',
        '',
        '## Step 2: Lexeme Candidates',
        'Based on the Step 1 findings, suggest lexeme candidates (dictionary entries) that could be created or updated.',
        'For each candidate, provide the lemma, part of speech, and a brief gloss.',
        '',
        'Please output your response in the following format:',
        '<step1>',
        '[Your annotation QA findings here]',
        '</step1>',
        '<step2>',
        '[Your lexeme candidate suggestions here]',
        '</step2>',
      ].join('\n');
    }

    // stepIndex === 1 (step2 retry)
    return [
      'You are continuing Step 2 of a composed workflow.',
      '',
      '## Previous Step 1 Result',
      previousStepResult && previousStepResult.trim().length > 0
        ? previousStepResult.trim()
        : '(no result available)',
      '',
      '## Step 2: Lexeme Candidates',
      'Based on the above findings, suggest lexeme candidates (dictionary entries).',
      'For each candidate, provide the lemma, part of speech, and a brief gloss.',
      '',
      'Please output your response in the following format:',
      '<step2>',
      '[Your lexeme candidate suggestions here]',
      '</step2>',
    ].join('\n');
  }

  if (template.id === 'segment_qa_then_annotation_qa_then_lexeme_candidates') {
    if (stepIndex === 0) {
      return [
        'You are executing a three-step composed workflow in a single response.',
        '',
        '## Step 1: Segment QA',
        'Answer the user question based on the selected segment context.',
        'Provide a concise answer with citations when appropriate.',
        '',
        '## Step 2: Annotation QA',
        'Review the selected annotations for consistency, completeness, and correctness.',
        'Report any issues found.',
        '',
        '## Step 3: Lexeme Candidates',
        'Based on the Step 1 and Step 2 findings, suggest lexeme candidates (dictionary entries).',
        'For each candidate, provide the lemma, part of speech, and a brief gloss.',
        '',
        'Please output your response in the following format:',
        '<step1>',
        '[Your segment QA answer here]',
        '</step1>',
        '<step2>',
        '[Your annotation QA findings here]',
        '</step2>',
        '<step3>',
        '[Your lexeme candidate suggestions here]',
        '</step3>',
      ].join('\n');
    }

    if (stepIndex === 1) {
      // step2 retry (step1 done, step2+3 missing)
      return [
        'You are continuing Step 2 of a three-step composed workflow.',
        '',
        '## Previous Step 1 Result',
        previousStepResult && previousStepResult.trim().length > 0
          ? previousStepResult.trim()
          : '(no result available)',
        '',
        '## Step 2: Annotation QA',
        'Review the selected annotations for consistency, completeness, and correctness.',
        'Report any issues found.',
        '',
        '## Step 3: Lexeme Candidates',
        'Based on the above findings, suggest lexeme candidates (dictionary entries).',
        'For each candidate, provide the lemma, part of speech, and a brief gloss.',
        '',
        'Please output your response in the following format:',
        '<step2>',
        '[Your annotation QA findings here]',
        '</step2>',
        '<step3>',
        '[Your lexeme candidate suggestions here]',
        '</step3>',
      ].join('\n');
    }

    if (stepIndex === 2) {
      // step3 retry (step1+2 done, step3 missing)
      return [
        'You are continuing Step 3 of a three-step composed workflow.',
        '',
        '## Previous Step 1 Result',
        previousStepResult && previousStepResult.trim().length > 0
          ? previousStepResult.trim()
          : '(no result available)',
        '',
        '## Previous Step 2 Result',
        previousStep2Result && previousStep2Result.trim().length > 0
          ? previousStep2Result.trim()
          : '(no result available)',
        '',
        '## Step 3: Lexeme Candidates',
        'Based on the above findings, suggest lexeme candidates (dictionary entries).',
        'For each candidate, provide the lemma, part of speech, and a brief gloss.',
        '',
        'Please output your response in the following format:',
        '<step3>',
        '[Your lexeme candidate suggestions here]',
        '</step3>',
      ].join('\n');
    }
  }

  return '';
}

/**
 * Parse the composed workflow output looking for <step1>…</step1>,
 * <step2>…</step2>, and optionally <step3>…</step3> tags.
 * Returns null if a required tag is missing or empty.
 */
export function parseComposedWorkflowOutput(
  template: ComposedWorkflowTemplate,
  content: string,
): { step1: string; step2: string; step3?: string } | null {
  const step1Match = content.match(/<step1>([\s\S]*?)<\/step1>/);
  const step2Match = content.match(/<step2>([\s\S]*?)<\/step2>/);

  if (!step1Match || !step2Match) return null;
  if (step1Match[1] === undefined || step2Match[1] === undefined) return null;

  const step1 = step1Match[1].trim();
  const step2 = step2Match[1].trim();

  if (step1.length === 0 || step2.length === 0) return null;

  const isThreeStep = template.steps.length === 3;
  if (isThreeStep) {
    const step3Match = content.match(/<step3>([\s\S]*?)<\/step3>/);
    if (!step3Match || step3Match[1] === undefined) return null;
    const step3 = step3Match[1].trim();
    if (step3.length === 0) return null;
    return { step1, step2, step3 };
  }

  return { step1, step2 };
}

/**
 * Build a short user prompt for step2 retry. The step1 result is already
 * in the chat history, so this prompt only needs to cue the model to
 * continue with Step 2.
 */
export function buildStep2RetryPrompt(): string {
  return '请继续完成候选词建议（Step 2）。';
}

/**
 * Build a short user prompt for step3 retry. The step1 and step2 results
 * are already in the chat history, so this prompt only needs to cue the
 * model to continue with Step 3.
 */
export function buildStep3RetryPrompt(): string {
  return '请继续完成候选词建议（Step 3）。';
}

export function createInitialComposedWorkflowState(
  template: ComposedWorkflowTemplate,
  originalUserText: string,
): ComposedWorkflowState {
  return {
    templateId: template.id,
    currentStepIndex: 0,
    stepResults: {},
    status: 'running',
    originalUserText,
  };
}

export interface AdvanceComposedWorkflowResult {
  nextState: ComposedWorkflowState;
  step1Result: string | null;
  step2Result: string | null;
  step3Result?: string | null;
}

/**
 * Advance the composed-workflow state after parsing the model output.
 *
 * Two-step template:
 *   - If both steps present → status 'done'.
 *   - If only step1 present → status 'step1_done' (step2 will be retried).
 *   - If neither present    → status 'failed'.
 *
 * Three-step template:
 *   - If all three steps present       → status 'done'.
 *   - If step1+2 present, step3 missing → status 'step2_done' (step3 will be retried).
 *   - If only step1 present            → status 'step1_done' (step2+3 will be retried).
 *   - If neither present               → status 'failed'.
 */
export function advanceComposedWorkflowStateAfterParse(
  stateInput: ComposedWorkflowState,
  parseResult: { step1: string; step2: string; step3?: string } | null,
  rawContent: string,
): AdvanceComposedWorkflowResult {
  const state = stripComposedPendingReflectionRetry(stateInput);
  const isThreeStep = state.templateId === 'segment_qa_then_annotation_qa_then_lexeme_candidates';

  if (parseResult) {
    const nextStepIndex = isThreeStep ? 3 : 2;
    const stepResults: Record<string, string> = {
      step1: parseResult.step1,
      step2: parseResult.step2,
    };
    if (isThreeStep && parseResult.step3) {
      stepResults.step3 = parseResult.step3;
    }
    return {
      nextState: {
        ...state,
        stepResults,
        currentStepIndex: nextStepIndex,
        status: 'done',
      },
      step1Result: parseResult.step1,
      step2Result: parseResult.step2,
      step3Result: parseResult.step3 ?? null,
    };
  }

  // Attempt to salvage as many steps as possible.
  const step1Match = rawContent.match(/<step1>([\s\S]*?)<\/step1>/);
  const step2Match = rawContent.match(/<step2>([\s\S]*?)<\/step2>/);

  if (step1Match && step1Match[1] !== undefined) {
    const step1 = step1Match[1].trim();
    if (step1.length > 0) {
      const step2Raw = step2Match?.[1];
      const hasStep2 = step2Raw !== undefined && step2Raw.trim().length > 0;
      if (hasStep2 && isThreeStep) {
        const step2 = step2Raw!.trim();
        // step1 + step2 present, step3 missing
        return {
          nextState: {
            ...state,
            stepResults: { step1, step2 },
            currentStepIndex: 2,
            status: 'step2_done',
          },
          step1Result: step1,
          step2Result: step2,
          step3Result: null,
        };
      }
      // Only step1 present
      return {
        nextState: {
          ...state,
          stepResults: { step1 },
          currentStepIndex: 1,
          status: 'step1_done',
        },
        step1Result: step1,
        step2Result: null,
        step3Result: null,
      };
    }
  }

  return {
    nextState: { ...state, status: 'failed' },
    step1Result: null,
    step2Result: null,
    step3Result: null,
  };
}

/**
 * Resolve the effective single-workflow selection for the current composed step.
 * Returns null when the composed workflow is finished or failed.
 */
export function resolveComposedStepWorkflowSelection(
  state: ComposedWorkflowState,
): { workflowId: VerticalWorkflowId; workflow: VerticalWorkflowV0 } | null {
  if (state.status === 'done' || state.status === 'failed') return null;

  if (state.templateId === 'annotation_qa_then_lexeme_candidates') {
    if (state.currentStepIndex === 0) {
      return { workflowId: 'annotation_qa', workflow: getVerticalWorkflowV0('annotation_qa') };
    }
    if (state.currentStepIndex === 1 || state.status === 'step1_done') {
      return { workflowId: 'lexeme_candidates', workflow: getVerticalWorkflowV0('lexeme_candidates') };
    }
  }

  if (state.templateId === 'segment_qa_then_annotation_qa_then_lexeme_candidates') {
    if (state.currentStepIndex === 0) {
      return { workflowId: 'segment_qa', workflow: getVerticalWorkflowV0('segment_qa') };
    }
    if (state.currentStepIndex === 1 || state.status === 'step1_done') {
      return { workflowId: 'annotation_qa', workflow: getVerticalWorkflowV0('annotation_qa') };
    }
    if (state.currentStepIndex === 2 || state.status === 'step2_done') {
      return { workflowId: 'lexeme_candidates', workflow: getVerticalWorkflowV0('lexeme_candidates') };
    }
  }

  return null;
}
