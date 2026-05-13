import { expect, type Page } from '@playwright/test';

const transcriptionDialogName = /新建转写层|Create transcription layer|New Transcription Layer/i;
const translationDialogName = /新建翻译层|Create translation layer|New Translation Layer/i;

/**
 * ARCH-9 / 轨头元信息：左轨创建转写层 + 翻译层（等待弹层关闭与按钮稳态，减轻 DOM detach flake）。
 */
export async function createTranscriptionAndTranslationLayersViaLeftRail(
  page: Page,
  opts: {
    transcription: { languageSearch: string; optionName: RegExp; iso6393: string };
    translation: { languageSearch: string; optionName: RegExp; iso6393: string };
  },
): Promise<void> {
  /** Prefer class: layer actions are portaled after slot mount; class is stable in E2E. */
  const leftRail = page.locator('.left-rail-layer-actions-root');
  await expect(leftRail).toBeVisible({ timeout: 25_000 });

  const createTranscriptionBtn = leftRail.getByRole('button', {
    name: /新建转写层|Create transcription layer/i,
  });
  const createTranslationBtn = leftRail.getByRole('button', {
    name: /新建翻译层|Create translation layer/i,
  });
  await expect(createTranslationBtn).toBeDisabled();

  await createTranscriptionBtn.click();
  const trcDialog = page.getByRole('dialog', { name: transcriptionDialogName });
  await expect(trcDialog).toBeVisible();
  await trcDialog.getByRole('combobox', { name: /语言名称|Language Name/i }).fill(opts.transcription.languageSearch);
  await trcDialog.getByRole('option', { name: opts.transcription.optionName }).first().click();
  await trcDialog.getByPlaceholder(/ISO 639-3/i).fill(opts.transcription.iso6393);
  const trcSubmit = trcDialog.locator('.dialog-footer button.panel-button--primary');
  await expect(trcSubmit).toBeEnabled();
  await trcSubmit.click();
  await expect(trcDialog).toBeHidden({ timeout: 20_000 });
  await page.waitForTimeout(3000);

  // Debug: check side pane layer count
  const sidePaneLayerCount = await page.locator('.transcription-side-pane-item-row').count();
  console.log(`Side pane layer count after creating transcription: ${sidePaneLayerCount}`);

  // Debug: check if any layer has transcription label
  const transcriptionLabels = await page.locator('.transcription-side-pane-item-row').filter({ hasText: /转写|Transcription/ }).count();
  console.log(`Transcription layers in side pane: ${transcriptionLabels}`);

  // Debug: screenshot before checking button
  await page.screenshot({ path: 'test-results/debug-before-translation-btn.png', fullPage: true });

  // Debug: list all buttons in left rail
  const leftRailButtons = await leftRail.locator('button').all();
  for (const btn of leftRailButtons) {
    const text = await btn.textContent();
    const disabled = await btn.isDisabled();
    console.log(`Left rail button: "${text?.trim()}", disabled=${disabled}`);
  }

  // Debug: check layer row classes
  const layerRow = page.locator('.transcription-side-pane-item-row').first();
  const layerButton = layerRow.locator('button').first();
  const className = await layerButton.getAttribute('class');
  console.log(`Layer button classes: ${className}`);

  // Debug: check translation button data attribute
  const disableReason = await createTranslationBtn.getAttribute('data-disable-reason');
  console.log(`Translation button data-disable-reason: ${disableReason}`);

  // Debug: count left-rail-layer-actions-root elements
  const leftRailCount = await page.locator('.left-rail-layer-actions-root').count();
  console.log(`Number of .left-rail-layer-actions-root elements: ${leftRailCount}`);

  // Debug: check SidePaneSidebar debug attribute
  const debugCount = await page.locator('[data-debug-disable]').count();
  console.log(`SidePaneSidebar [data-debug-disable] count: ${debugCount}`);

  // Debug: check window.__jieyu_layers_next (set directly in createLayer)
  let windowLayersNext: Array<{ id: string; layerType: string; key: string }> = [];
  try {
    windowLayersNext = await page.evaluate(() => {
      // @ts-ignore
      const layers = window.__jieyu_layers_next as Array<{ id: string; layerType: string; key: string }> | undefined;
      return layers ? layers.map(l => ({ id: l.id, layerType: l.layerType, key: l.key })) : [];
    });
  } catch (e) {
    console.log(`page.evaluate error: ${e}`);
  }
  console.log(`Window layers next: ${JSON.stringify(windowLayersNext)}`);

  await expect(createTranslationBtn).toBeEnabled({ timeout: 25_000 });
  await createTranslationBtn.click();
  const trlDialog = page.getByRole('dialog', { name: translationDialogName });
  await expect(trlDialog).toBeVisible();
  await trlDialog.getByRole('combobox', { name: /语言名称|Language Name/i }).fill(opts.translation.languageSearch);
  await trlDialog.getByRole('option', { name: opts.translation.optionName }).first().click();
  await trlDialog.getByPlaceholder(/ISO 639-3/i).fill(opts.translation.iso6393);
  const trlSubmit = trlDialog.locator('.dialog-footer button.panel-button--primary');
  await expect(trlSubmit).toBeEnabled();
  await trlSubmit.click();
  await expect(trlDialog).toBeHidden({ timeout: 20_000 });
}
