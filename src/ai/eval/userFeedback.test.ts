import { describe, expect, it } from 'vitest';
import {
  classifyFeedback,
  createUserFeedbackEntry,
  sanitizeFeedbackContent,
} from './userFeedback';

describe('sanitizeFeedbackContent', () => {
  it('redacts project name', () => {
    const result = sanitizeFeedbackContent('This project is about Miao language.');
    expect(result).toContain('[PROJECT]');
    expect(result).not.toContain('project');
  });

  it('redacts language name', () => {
    const result = sanitizeFeedbackContent('The language name is Hmong.');
    expect(result).toContain('[LANGUAGE]');
  });

  it('redacts speaker', () => {
    const result = sanitizeFeedbackContent('Speaker A said hello.');
    expect(result).toContain('[SPEAKER]');
  });

  it('redacts lexeme', () => {
    const result = sanitizeFeedbackContent('The lexeme is ambiguous.');
    expect(result).toContain('[LEXEME]');
  });

  it('redacts timestamp', () => {
    const result = sanitizeFeedbackContent('Recorded at 2024-01-15T09:30:00Z.');
    expect(result).toContain('[TIMESTAMP]');
    expect(result).not.toContain('2024-01-15');
  });

  it('returns unchanged text when no sensitive patterns match', () => {
    const text = 'Hello world, this is a normal sentence.';
    expect(sanitizeFeedbackContent(text)).toBe(text);
  });
});

describe('classifyFeedback', () => {
  it('classifies thumbs_up as other', () => {
    expect(classifyFeedback('Great answer!', 'thumbs_up')).toBe('other');
  });

  it('detects hallucination', () => {
    expect(classifyFeedback('This seems like hallucination.', 'thumbs_down')).toBe('hallucination');
    expect(classifyFeedback('你在编造内容', 'thumbs_down')).toBe('hallucination');
  });

  it('detects wrong_scope', () => {
    expect(classifyFeedback('Answer is out of scope.', 'thumbs_down')).toBe('wrong_scope');
    expect(classifyFeedback('完全离题了', 'thumbs_down')).toBe('wrong_scope');
  });

  it('detects missing_evidence', () => {
    expect(classifyFeedback('Missing evidence for this claim.', 'thumbs_down')).toBe('missing_evidence');
    expect(classifyFeedback('没有引用来源', 'thumbs_down')).toBe('missing_evidence');
  });

  it('detects contradiction', () => {
    expect(classifyFeedback('This contradicts previous answer.', 'thumbs_down')).toBe('contradiction');
    expect(classifyFeedback('前后矛盾', 'thumbs_down')).toBe('contradiction');
  });

  it('defaults to other', () => {
    expect(classifyFeedback('Just bad.', 'thumbs_down')).toBe('other');
  });
});

describe('createUserFeedbackEntry', () => {
  it('creates a complete entry with auto-sanitize and auto-classify', () => {
    const entry = createUserFeedbackEntry({
      messageId: 'msg-001',
      conversationId: 'conv-001',
      rating: 'thumbs_down',
      originalContent: 'The project data is inconsistent and missing evidence.',
      reason: 'quality concern',
      metadata: { workflowId: 'segment_qa', providerId: 'openai' },
    });

    expect(entry.id).toMatch(/^ufb_/);
    expect(entry.messageId).toBe('msg-001');
    expect(entry.sanitizedContent).toContain('[PROJECT]');
    expect(entry.category).toBe('missing_evidence');
    expect(entry.createdAt).toBeTruthy();
    expect(entry.metadata?.workflowId).toBe('segment_qa');
  });

  it('creates a thumbs_up entry', () => {
    const entry = createUserFeedbackEntry({
      messageId: 'msg-002',
      conversationId: 'conv-001',
      rating: 'thumbs_up',
      originalContent: 'Perfect answer!',
    });

    expect(entry.rating).toBe('thumbs_up');
    expect(entry.category).toBe('other');
  });
});
