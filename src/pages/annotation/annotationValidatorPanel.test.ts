import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { AnnotationIgtRow } from '../useAnnotationWorkspaceController';
import {
  collectAnnotationValidatorGlosses,
  loadAnnotationValidatorPanel,
} from './annotationValidatorPanel';

const ROW: AnnotationIgtRow = {
  id: 'uid-1',
  timeLabel: '0:00',
  startTime: 0,
  endTime: 1,
  mediaId: 'mid-1',
  surface: 'dogs',
  tokens: [{ id: 'tok-1', form: 'dogs', gloss: 'dog-PL', pos: '', glossLang: 'default' }],
  translation: '',
  transcriptionHref: '/transcription',
};

describe('annotationValidatorPanel', () => {
  beforeEach(async () => {
    await db.structural_rule_profiles.clear();
    await db.unit_relations.clear();
  });

  it('prefers a draft gloss over the stored gloss', () => {
    expect(
      collectAnnotationValidatorGlosses(ROW, { 'tok-1': { pos: '', gloss: 'cat-PL' } }),
    ).toEqual([{ tokenId: 'tok-1', form: 'dogs', gloss: 'cat-PL' }]);
  });

  it('drops a blank gloss', () => {
    expect(collectAnnotationValidatorGlosses(ROW, { 'tok-1': { pos: '', gloss: '  ' } })).toEqual(
      [],
    );
  });

  it('previews dog-PL without writing a relation', async () => {
    const items = await loadAnnotationValidatorPanel([
      { tokenId: 'tok-1', form: 'dogs', gloss: 'dog-PL' },
    ]);

    expect(items[0]?.segments).toEqual(['dog', 'PL']);
    expect(items[0]?.needsReview).toBe(false);
    expect(await db.unit_relations.count()).toBe(0);
  });

  it('marks an unmatched infix as needing review and does not write a candidate', async () => {
    const items = await loadAnnotationValidatorPanel([
      { tokenId: 'tok-1', form: 'touch', gloss: 'touch<PRS' },
    ]);

    expect(items[0]?.needsReview).toBe(true);
    expect(items[0]?.warnings.some((warning) => warning.includes('infix'))).toBe(true);
    expect(await db.unit_relations.count()).toBe(0);
  });
});
