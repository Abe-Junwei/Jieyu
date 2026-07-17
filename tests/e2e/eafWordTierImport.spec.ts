/**
 * Chromium: EAF Symbolic_Subdivision word tier → unit_tokens (+ lexemeId).
 */
import { test, expect } from '@playwright/test';

import {
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

/** Media name/times must fit the e2e WAV (~0.25s) so import skips mismatch-ack. */
const EAF_WITH_WORDS = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="2026-07-17T00:00:00.000Z" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="e2e-field-sample.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./e2e-field-sample.wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="200" />
  </TIME_ORDER>
  <TIER TIER_ID="utterance" LINGUISTIC_TYPE_REF="utterance-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>hello world</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="words" LINGUISTIC_TYPE_REF="words-lt" PARENT_REF="utterance">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="w2" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>world</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="words-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Subdivision" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;

test.describe('EAF word-tier annotation import', () => {
  test('imports Symbolic_Subdivision words into unit_tokens with lexemeId', async ({ page }) => {
    test.setTimeout(180_000);

    await setupFieldProjectWithMediaAndSegments(page);
    await waitForDexie(page);

    const annotationInput = page.locator(
      'input.left-rail-project-hub-file-input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]',
    );
    await annotationInput.setInputFiles({
      name: 'words.eaf',
      mimeType: 'application/xml',
      buffer: Buffer.from(EAF_WITH_WORDS, 'utf-8'),
    });

    await expect(
      page.getByRole('button', { name: /开始导入标注|Start annotation import/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /开始导入标注|Start annotation import/i }).click();

    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const dexie = (
            globalThis as unknown as {
              __jieyuDexie__: {
                open: () => Promise<unknown>;
                unit_tokens: {
                  toArray: () => Promise<Array<{ form?: Record<string, string>; lexemeId?: string }>>;
                };
                lexemes: { count: () => Promise<number> };
              };
            }
          ).__jieyuDexie__;
          await dexie.open();
          const tokens = await dexie.unit_tokens.toArray();
          const imported = tokens.filter((token) => {
            const form = token.form?.default ?? '';
            return form === 'hello' || form === 'world';
          });
          const forms = new Set(imported.map((token) => token.form?.default ?? ''));
          const allHaveLexeme = imported.every(
            (token) => typeof token.lexemeId === 'string' && token.lexemeId.length > 0,
          );
          const lexemeCount = await dexie.lexemes.count();
          return (
            forms.has('hello') &&
            forms.has('world') &&
            imported.length >= 2 &&
            allHaveLexeme &&
            lexemeCount >= 2
          );
        });
      }, { timeout: 60_000 })
      .toBe(true);
  });
});
