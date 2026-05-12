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
  const trcSubmit = trcDialog.getByTestId('layer-action-submit-create-transcription');
  await expect(trcSubmit).toBeEnabled();
  await trcSubmit.click();
  await expect(trcDialog).toBeHidden({ timeout: 20_000 });

  await expect(createTranslationBtn).toBeEnabled({ timeout: 25_000 });
  await createTranslationBtn.click();
  const trlDialog = page.getByRole('dialog', { name: translationDialogName });
  await expect(trlDialog).toBeVisible();
  await trlDialog.getByRole('combobox', { name: /语言名称|Language Name/i }).fill(opts.translation.languageSearch);
  await trlDialog.getByRole('option', { name: opts.translation.optionName }).first().click();
  await trlDialog.getByPlaceholder(/ISO 639-3/i).fill(opts.translation.iso6393);
  const trlSubmit = trlDialog.getByTestId('layer-action-submit-create-translation');
  await expect(trlSubmit).toBeEnabled();
  await trlSubmit.click();
  await expect(trlDialog).toBeHidden({ timeout: 20_000 });
}
