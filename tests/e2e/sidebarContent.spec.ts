import { expect, test, type Page } from '@playwright/test';
import {
  importMediaViaDialog,
  seedThreeSegmentsOnCurrentProject,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';
import { createTranscriptionAndTranslationLayersViaLeftRail } from './_helpers/layerCreationFlow';
import { buildMinimalWavBytes } from './_helpers/minimalWav';

async function setupSidebarProject(page: Page, withAnnotations = true) {
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await waitForDexie(page);
  await importMediaViaDialog(page, {
    name: 'sidebar.wav',
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
  if (withAnnotations) {
    const values = ['first sidebar sentence', 'second sidebar sentence', 'last sidebar sentence'];
    const slots =
      values.map((_, i) => `<TIME_SLOT TIME_SLOT_ID="s${i}" TIME_VALUE="${i * 1000}"/>`).join('') +
      '<TIME_SLOT TIME_SLOT_ID="s3" TIME_VALUE="3000"/>';
    const rows = values
      .map(
        (value, i) =>
          `<ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a${i}" TIME_SLOT_REF1="s${i}" TIME_SLOT_REF2="s${i + 1}"><ANNOTATION_VALUE>${value}</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>`,
      )
      .join('');
    const eaf = `<?xml version="1.0" encoding="UTF-8"?><ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="2026-10-24T00:00:00Z" FORMAT="3.0" VERSION="3.0"><HEADER MEDIA_FILE="" TIME_UNITS="milliseconds"><MEDIA_DESCRIPTOR MEDIA_URL="sidebar.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./sidebar.wav" /></HEADER><TIME_ORDER>${slots}</TIME_ORDER><TIER TIER_ID="utterance" LINGUISTIC_TYPE_REF="utterance-lt">${rows}</TIER><LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false"/></ANNOTATION_DOCUMENT>`;
    await page
      .locator(
        'input.left-rail-project-hub-file-input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]',
      )
      .setInputFiles({
        name: 'sidebar.eaf',
        mimeType: 'application/xml',
        buffer: Buffer.from(eaf),
      });
    await page.getByRole('button', { name: /开始导入标注|Start annotation import/i }).click();
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const db = (
              globalThis as unknown as {
                __jieyuDexie__: { source_records: { count: () => Promise<number> } };
              }
            ).__jieyuDexie__;
            return db.source_records.count();
          }),
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);
    await page.goto(`/annotation?textId=${project.textId}&mediaId=${project.mediaId}`);
    await expect(
      page
        .locator('.annotation-igt-list')
        .getByRole('textbox', { name: 'Surface', exact: true })
        .last(),
    ).toHaveValue('last sidebar sentence');
  }
  return `?textId=${project.textId}&mediaId=${project.mediaId}`;
}

test('short desktop sidebar keeps segment navigation usable at minimum and maximum widths', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const scope = await setupSidebarProject(page);
  await page.goto(`/transcription${scope}`);
  await expect(page.locator('.app-side-pane-segment-list-item-btn').last()).toContainText(
    'last sidebar sentence',
  );
  for (const [width, scale] of [
    [240, 1],
    [272, 1],
    [420, 1.4],
  ]) {
    await page.setViewportSize({ width: 1280, height: 720 });
    const resizer = page.locator('.app-side-pane-resizer');
    // 与 sidebarHandle.spec 一致：先 focus 再 page.keyboard，避免 locator.press 丢键导致 flake
    // Match sidebarHandle.spec: focus then page.keyboard so locator.press cannot drop the key.
    await resizer.focus();
    await page.keyboard.press('Home');
    await expect(resizer).toHaveAttribute('aria-valuenow', '272');
    if (width === 240) {
      await page.keyboard.press('ArrowLeft');
      await expect(resizer).toHaveAttribute('aria-valuenow', '248');
      await page.keyboard.press('ArrowLeft');
    } else if (width === 420) {
      await page.keyboard.press('Shift+ArrowRight');
      await expect(resizer).toHaveAttribute('aria-valuenow', '352');
      await page.keyboard.press('Shift+ArrowRight');
    }
    await expect(resizer).toHaveAttribute('aria-valuenow', String(width));
    await page.evaluate(
      (value) => document.documentElement.style.setProperty('--ui-font-scale', String(value)),
      scale,
    );
    await expect
      .poll(() =>
        page.locator('.app-side-pane-segment-list-scroll').evaluate((el) => el.clientHeight),
      )
      .toBeGreaterThanOrEqual(100);
    for (const item of [
      page.locator('.app-side-pane-segment-list-item-btn').first(),
      page.locator('.app-side-pane-segment-list-item-btn').last(),
    ]) {
      await item.scrollIntoViewIfNeeded();
      await expect(item).toBeInViewport();
      await item.click();
    }
    const pane = page.locator('.transcription-side-pane-portaled-stack');
    await pane.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.locator('.transcription-side-pane-quick-action').last()).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`sidebar-${width}-${scale}.png`) });
  }
});

test('sidebar summaries update after saved lexicon edits and corpus selection, with long text still scrollable', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const scope = await setupSidebarProject(page);
  await page.goto('/lexicon');
  await page.getByTestId('lexicon-entry-create').click();
  await page.getByTestId('lexicon-entry-headword').fill('sidebar-ʃa');
  await page.getByTestId('lexicon-entry-translation').fill('original glossary');
  await page.getByTestId('lexicon-entry-save').click();
  const sidebar = page.locator('.app-side-pane');
  await expect(sidebar).toContainText('original glossary');
  const definition = 'updated glossary with linguistic details. '.repeat(100);
  await page.getByTestId('lexicon-entry-translation').fill(definition);
  await page.getByTestId('lexicon-entry-save').click();
  await expect(sidebar).toContainText(definition.trim());
  await page.reload();
  await expect(page.getByTestId('lexicon-entry-translation')).toHaveValue(definition.trim());
  await expect(sidebar).toContainText(definition.trim());
  await page.setViewportSize({ width: 1280, height: 720 });
  const link = sidebar.getByRole('link', { name: /Open orthography manager|打开正字法管理器/ });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  await expect(link).toBeVisible();
  await page.screenshot({ path: info.outputPath('long-lexicon-summary.png') });
  await page.goto(`/corpus${scope}`);
  await expect(page.locator('.corpus-library-workspace input[type="checkbox"]')).toHaveCount(3);
  await expect(sidebar).toContainText(/3 units|共 3|3 个/);
  await page.locator('.corpus-library-workspace input[type="checkbox"]').first().check();
  await expect(page.getByTestId('corpus-library-copy-plain')).toBeEnabled();
  await expect(sidebar).toContainText(/1 selected|已选.*1|1.*已选/);
  await page.locator('.corpus-library-workspace input[type="checkbox"]').first().uncheck();
  await expect(sidebar).toContainText(/0 selected|已选.*0|0.*已选/);
  await page.goto(`/analysis${scope}`);
  await expect(sidebar).toContainText(/3 units|共 3|3 个/);
});

test('empty annotation scope retains project file navigation and settings tabs support keyboard', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const scope = await setupSidebarProject(page, false);
  await page.goto(`/annotation${scope}`);
  await expect(page.locator('.app-side-pane')).toContainText('sidebar.wav');
  await expect(
    page
      .locator('.app-side-pane')
      .getByRole('link', { name: /Open transcription workspace|打开转写工作台/ }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('empty-annotation-navigation.png') });
  await page.locator('.app-left-rail-footer button').last().click();
  const tabs = page.getByRole('tab');
  await tabs.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  const id = await tabs.nth(1).getAttribute('id');
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', id!);
  await page.keyboard.press('End');
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(tabs.first()).toBeFocused();
});
