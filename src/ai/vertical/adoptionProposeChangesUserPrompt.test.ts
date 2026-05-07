import { describe, expect, it } from 'vitest';
import { createAdoptionItem } from './adoptionQueue';
import { buildAdoptionAcceptProposeChangesUserPrompt } from './adoptionProposeChangesUserPrompt';

describe('buildAdoptionAcceptProposeChangesUserPrompt', () => {
  it('includes workflow, requestId, summary and optional raw detail', () => {
    const item = createAdoptionItem({
      workflowId: 'elan_flex_compatibility',
      requestId: 'req-1',
      summary: 'Title',
      evidencePacketIds: ['e1'],
      rawContent: 'Body line',
    });
    const text = buildAdoptionAcceptProposeChangesUserPrompt(item, 'HEAD');
    expect(text.startsWith('HEAD')).toBe(true);
    expect(text).toContain('[workflow] elan_flex_compatibility');
    expect(text).toContain('[requestId] req-1');
    expect(text).toContain('[summary]');
    expect(text).toContain('Title');
    expect(text).toContain('[detail]');
    expect(text).toContain('Body line');
  });
});
