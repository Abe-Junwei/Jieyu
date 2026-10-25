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
    name: 'corpus-review.wav',
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
        { id: 'unit_e2e_corpus_a', text: 'corpus-alpha', start: 0, end: 1 },
        { id: 'unit_e2e_corpus_b', text: 'corpus-beta', start: 1, end: 2 },
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
  await page.goto(`/corpus?textId=${project.textId}&mediaId=${project.mediaId}`);
  await expect(page.getByTestId('corpus-library-workspace')).toBeVisible();
  return project;
}

test('corpus filter and source jump keep the same unit text', async ({ page }) => {
  test.setTimeout(120_000);
  const project = await prepare(page);
  const list = page.getByTestId('corpus-library-body');
  await expect(list.getByText('corpus-alpha', { exact: true })).toBeVisible();
  await expect(list.getByText('corpus-beta', { exact: true })).toBeVisible();

  const filter = page.getByRole('searchbox', { name: /Filter units|筛选句段/ });
  await filter.fill('corpus-alpha');
  await expect(list.getByText('corpus-alpha', { exact: true })).toBeVisible();
  await expect(list.getByText('corpus-beta', { exact: true })).toHaveCount(0);
  await filter.fill('no-such-unit');
  await expect(list).toContainText(/No units match the current filter|没有符合筛选的句段/);
  await expect(list).not.toContainText(/No transcription record|还没有可浏览的转写记录/);
  await filter.fill('');
  await expect(list.getByText('corpus-beta', { exact: true })).toBeVisible();

  await filter.fill('corpus-alpha');
  const source = page
    .getByTestId('corpus-library-unit-unit_e2e_corpus_a')
    .getByRole('link', { name: /Open in transcription|在转写中打开/ });
  await expect(source).toHaveAttribute('href', /unitId=unit_e2e_corpus_a/);
  await source.click();
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible();
  await expect(page.getByText('corpus-alpha', { exact: true }).first()).toBeVisible();

  await page.goto(`/corpus?textId=${project.textId}&mediaId=${project.mediaId}`);
  await expect(filter).toHaveValue('corpus-alpha');
  await expect(list.getByText('corpus-alpha', { exact: true })).toBeVisible();
  await expect(list.getByText('corpus-beta', { exact: true })).toHaveCount(0);
  await filter.fill('');
  await expect(list.getByText('corpus-beta', { exact: true })).toBeVisible();
});
