import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  importMediaViaDialog,
  seedThreeSegmentsOnCurrentProject,
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';
import { createTranscriptionAndTranslationLayersViaLeftRail } from './_helpers/layerCreationFlow';
import { buildMinimalWavBytes } from './_helpers/minimalWav';

test('populated workspaces retain usable desktop bounds and accessible controls', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await waitForDexie(page);
  await importMediaViaDialog(page, {
    name: 'synthetic-ui-review.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from(buildMinimalWavBytes(4)),
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
  const transcription = `/transcription?textId=${project.textId}&mediaId=${project.mediaId}`;
  const scope = `?textId=${project.textId}&mediaId=${project.mediaId}`;
  const findings: unknown[] = [];
  for (const [width, height] of [
    [1440, 1000],
    [1280, 720],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [name, route, selector] of [
      ['home', '/', '.home-page'],
      ['transcription', transcription, '[data-testid="transcription-workspace-screen"]'],
      ['annotation', `/annotation${scope}`, '[data-testid="annotation-workspace"]'],
      ['lexicon', '/lexicon', '.lexicon-workspace'],
      ['corpus', `/corpus${scope}`, '[data-testid="corpus-library-workspace"]'],
      ['metadata', '/assets/language-metadata', '.lm-shell'],
      ['profiles', '/assets/structural-profiles', '.lm-shell'],
      ['orthographies', '/assets/orthographies', '.om-shell'],
      ['bridges', '/assets/orthography-bridges', '.ob-shell'],
      ['analysis', `/analysis${scope}`, '.analysis-workspace'],
    ] as const) {
      await page.goto(route);
      await expect(page.locator(selector).first()).toBeVisible({ timeout: 25_000 });
      await expect(page.locator('main h1').first()).toBeVisible();
      const bounds = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
        paneRight: document.querySelector('.app-side-pane')?.getBoundingClientRect().right ?? 0,
        workspaceLeft: document
          .querySelector(
            '.annotation-workspace, .lexicon-workspace, .corpus-library-workspace, .analysis-workspace',
          )
          ?.getBoundingClientRect().left,
      }));
      const { violations } = await new AxeBuilder({ page }).analyze();
      if (
        bounds.content > bounds.width + 2 ||
        violations.length ||
        (bounds.workspaceLeft !== undefined && bounds.workspaceLeft < bounds.paneRight - 2)
      ) {
        findings.push({ name, width, height, bounds, violations });
      }
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
    }
  }
  await info.attach('workspace-findings', {
    body: JSON.stringify(findings, null, 2),
    contentType: 'application/json',
  });
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
});

test('transcription creation explains its own modality without translation boundary instructions', async ({
  page,
}, info) => {
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await page
    .locator('.left-rail-layer-actions-root')
    .getByRole('button', {
      name: /新建转写层|Create transcription layer/i,
    })
    .click();
  const dialog = page.getByRole('dialog', {
    name: /新建转写层|Create transcription layer|New Transcription Layer/i,
  });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath('transcription-create.png') });
  await expect(dialog).not.toContainText(
    /纯文字翻译|口译录音|text-only translation|interpreting recording/i,
  );
  await expect(dialog).not.toContainText(/翻译层会沿用|translation layers inherit/i);
});

test('lexicon entry edits survive reopening and empty search can be cleared', async ({ page }) => {
  test.setTimeout(60_000);
  await setupFieldProjectWithMediaAndSegments(page);
  await page.goto('/lexicon');
  await page.getByTestId('lexicon-entry-create').click();
  await page.getByTestId('lexicon-entry-headword').fill('UI-review-ʃa');
  await page.getByTestId('lexicon-entry-translation').fill('synthetic translation');
  await page.getByTestId('lexicon-entry-save').click();
  await expect(page.getByTestId('lexicon-entry-delete')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('lexicon-entry-headword')).toHaveValue('UI-review-ʃa');
  await expect(page.getByTestId('lexicon-entry-translation')).toHaveValue('synthetic translation');
  const search = page.getByRole('searchbox');
  await search.fill('no-such-lexeme');
  await expect(
    page.getByRole('list', { name: /Entry list|词条列表/ }).getByRole('button'),
  ).toHaveCount(0);
  await search.fill('');
  await expect(
    page.getByRole('list', { name: /Entry list|词条列表/ }).getByRole('button'),
  ).toHaveCount(1);
});
