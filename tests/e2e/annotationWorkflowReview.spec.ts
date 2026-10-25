import { expect, test, type Page } from '@playwright/test';
import {
  importMediaViaDialog,
  seedThreeSegmentsOnCurrentProject,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';
import { createTranscriptionAndTranslationLayersViaLeftRail } from './_helpers/layerCreationFlow';
import { buildMinimalWavBytes } from './_helpers/minimalWav';

async function prepare(page: Page) {
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await waitForDexie(page);
  await importMediaViaDialog(page, {
    name: 'annotation-review.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from(buildMinimalWavBytes(8)),
  });
  await createTranscriptionAndTranslationLayersViaLeftRail(page, {
    transcription: {
      languageSearch: 'Chinese',
      optionName: /Chinese|中文|汉语|zho/i,
      iso6393: 'zho',
    },
    translation: { languageSearch: 'French', optionName: /French|法语|fra/i, iso6393: 'fra' },
  });
  const project = await seedThreeSegmentsOnCurrentProject(page);
  await page.evaluate(
    async ({ textId, mediaId, layerId }) => {
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__: {
            open: () => Promise<unknown>;
            layer_units: { put: (row: Record<string, unknown>) => Promise<unknown> };
            layer_unit_contents: { put: (row: Record<string, unknown>) => Promise<unknown> };
          };
        }
      ).__jieyuDexie__;
      await dexie.open();
      const createdAt = '2099-06-10T00:00:00.000Z';
      const rows = [
        { id: 'unit_e2e_ann', text: 'alpha', start: 0, end: 1 },
        { id: 'unit_e2e_other', text: 'beta', start: 1, end: 2 },
      ];
      for (const row of rows) {
        await dexie.layer_units.put({
          id: row.id,
          textId,
          mediaId,
          layerId,
          unitType: 'unit',
          startTime: row.start,
          endTime: row.end,
          createdAt,
          updatedAt: createdAt,
          provenance: { actorType: 'human', method: 'manual', createdAt },
        });
        await dexie.layer_unit_contents.put({
          id: `cnt_${row.id}`,
          textId,
          unitId: row.id,
          layerId,
          contentRole: 'primary_text',
          modality: 'text',
          text: row.text,
          sourceType: 'human',
          createdAt,
          updatedAt: createdAt,
          provenance: { actorType: 'human', method: 'manual', createdAt },
        });
      }
    },
    project,
  );
  await page.goto(
    `/annotation?textId=${project.textId}&mediaId=${project.mediaId}&unitId=unit_e2e_ann`,
  );
  await expect(page.getByTestId('annotation-workspace')).toBeVisible();
  return project;
}

async function storedTokenForms(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          unit_tokens: { toArray: () => Promise<Array<{ form: unknown }>> };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const rows = await dexie.unit_tokens.toArray();
    return JSON.stringify(rows.map((row) => row.form));
  });
}

test('annotation word, morpheme, and gloss survive leaving the workspace', async ({ page }) => {
  test.setTimeout(120_000);
  const project = await prepare(page);
  const surface = page.locator('input.annotation-igt-sentence-input[value="alpha"]');
  await expect(surface).toBeVisible();
  await surface.focus();
  await page.getByRole('button', { name: /切成词|Split into words/ }).click();
  await page.getByRole('button', { name: /确认二次分词|Apply retokenize/ }).click();
  const word = page.getByRole('textbox', { name: /^词$|^Words$/ }).first();
  await expect(word).toHaveValue('alpha');
  await word.fill('al-pha');
  await word.press('Tab');
  await expect.poll(() => storedTokenForms(page)).toContain('al-pha');

  await page.locator('[data-testid^="annotation-igt-word-actions-"]').first().click();
  await page.locator('[data-testid^="annotation-igt-seed-morph-"]').click();
  await expect(page.getByRole('button', { name: 'al-pha', exact: true })).toBeVisible();

  const gloss = page.getByRole('textbox', { name: /^Gloss$|^标注$/ }).first();
  await gloss.fill('N');
  await gloss.press('Enter');
  await expect(page.getByTestId('annotation-keyboard-status')).toContainText(/已保存|Saved/);

  await page.locator('.annotation-workspace-return').click();
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible();
  await page.goto(
    `/annotation?textId=${project.textId}&mediaId=${project.mediaId}&unitId=unit_e2e_ann`,
  );
  await expect(page.getByRole('textbox', { name: /^词$|^Words$/ }).first()).toHaveValue('al-pha');
  await expect(page.getByRole('button', { name: 'al-pha', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Gloss$|^标注$/ }).first()).toHaveValue('N');
  await expect(page.locator('input.annotation-igt-sentence-input[value="beta"]')).toHaveCount(1);
});
