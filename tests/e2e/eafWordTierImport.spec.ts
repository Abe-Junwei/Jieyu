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

/** FLEx-shaped tiers: sentence is the word form, phrase gloss is the only extra layer. */
const FLEX_PHRASE_EAF = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="2026-07-17T00:00:00.000Z" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="e2e-field-sample.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./e2e-field-sample.wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="200" />
  </TIME_ORDER>
  <TIER TIER_ID="A_word-gls-zh-CN" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_word-txt">
    <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="g1" ANNOTATION_REF="w1"><ANNOTATION_VALUE>G1</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
  </TIER>
  <TIER TIER_ID="A_word-txt" LINGUISTIC_TYPE_REF="sub-lt" PARENT_REF="A_phrase-segnum-en">
    <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>aa</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
  </TIER>
  <TIER TIER_ID="A_phrase-segnum-en" LINGUISTIC_TYPE_REF="align-lt" PARTICIPANT="***">
    <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>1</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
  </TIER>
  <TIER TIER_ID="A_phrase-gls-en" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_phrase-segnum-en">
    <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="align-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="assoc-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="sub-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Subdivision" GRAPHIC_REFERENCES="false" />
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
      .poll(
        async () => {
          return page.evaluate(async () => {
            const dexie = (
              globalThis as unknown as {
                __jieyuDexie__: {
                  open: () => Promise<unknown>;
                  unit_tokens: {
                    toArray: () => Promise<
                      Array<{ form?: Record<string, string>; lexemeId?: string }>
                    >;
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
        },
        { timeout: 60_000 },
      )
      .toBe(true);
  });

  test('shows the sentence and phrase gloss, not the word gloss, in the layer list', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      localStorage.setItem('jieyu.locale', 'en-US');
    });

    await setupFieldProjectWithMediaAndSegments(page);
    await waitForDexie(page);

    const layerCountBefore = await page.locator('.transcription-side-pane-item-row').count();
    const annotationInput = page.locator(
      'input.left-rail-project-hub-file-input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]',
    );
    await annotationInput.setInputFiles({
      name: 'phrase.eaf',
      mimeType: 'application/xml',
      buffer: Buffer.from(FLEX_PHRASE_EAF, 'utf-8'),
    });

    await expect(
      page.getByRole('button', { name: /开始导入标注|Start annotation import/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /开始导入标注|Start annotation import/i }).click();

    await expect
      .poll(
        async () => {
          return page.evaluate(async () => {
            const dexie = (
              globalThis as unknown as {
                __jieyuDexie__: {
                  open: () => Promise<unknown>;
                  layer_unit_contents: { toArray: () => Promise<Array<{ text?: string }>> };
                  tier_definitions: {
                    toArray: () => Promise<Array<{ key?: string; name?: Record<string, string> }>>;
                  };
                };
              }
            ).__jieyuDexie__;
            await dexie.open();
            const texts = (await dexie.layer_unit_contents.toArray()).map((row) => row.text ?? '');
            const tiers = await dexie.tier_definitions.toArray();
            const labels = tiers.flatMap((tier) => [
              tier.key ?? '',
              ...Object.values(tier.name ?? {}),
            ]);
            return (
              texts.includes('aa') &&
              texts.includes('the sentence') &&
              !texts.includes('G1') &&
              !texts.includes('1') &&
              labels.every((label) => !label.includes('word-gls') && !label.includes('G1'))
            );
          });
        },
        { timeout: 60_000 },
      )
      .toBe(true);

    const rows = page.locator('.transcription-side-pane-item-row');
    await expect(rows).toHaveCount(layerCountBefore + 1);
    const layerListText = (await rows.allTextContents()).join('\n');
    expect(layerListText).not.toContain('word-gls');
    expect(layerListText).not.toContain('G1');
    await expect(page.getByText('the sentence', { exact: true }).first()).toBeVisible();
    await expect(page.locator('.app-side-pane-segment-list-item-text', { hasText: /^aa$/ })).toBeVisible();
    await expect(
      page.getByTestId('transcription-workspace-screen').getByText('aa', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('G1', { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: '/opt/cursor/artifacts/flex-elan-import-layers.png',
      fullPage: true,
    });
  });
});
