/**
 * 转写时间轴：轨头右键菜单 →「编辑该层元信息」打开 LayerActionPopover（真实浏览器）。
 * 覆盖单元测试中在 jsdom 下省略的弹层路径；轨头菜单与纵向对读层头菜单共用 `buildLayerOperationMenuItems`。
 * 文件名含 VerticalReading 为历史命名；本 spec 走横向 `.timeline-lane-header`（非 `timeline-paired-reading-view` 壳）。
 * 关闭弹层：点标题栏最后一个 `.icon-btn`（与底部 Ghost「Cancel」区分，避免 Playwright strict 双匹配）。
 */
import { test, expect } from '@playwright/test';

test.describe('转写轨头层元信息 | Timeline lane header layer metadata', () => {
  test.describe.configure({ timeout: 60_000 });

  test('轨头上下文菜单可打开编辑元信息弹层并可关闭 | Lane header opens edit-metadata dialog', async ({ page }) => {
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    const leftRailActions = page.locator('.left-rail-layer-actions-root');
    const createTranscriptionEntry = leftRailActions.getByRole('button', { name: /新建转写层|Create transcription layer/i });
    const createTranslationButton = leftRailActions.getByRole('button', { name: /新建翻译层|Create translation layer/i });
    await expect(createTranslationButton).toBeDisabled();

    await createTranscriptionEntry.click();
    const createTranscriptionDialog = page.getByRole('dialog', { name: /新建转写层|Create transcription layer|New Transcription Layer/i });
    await expect(createTranscriptionDialog).toBeVisible();
    await createTranscriptionDialog.getByRole('combobox', { name: /语言名称|Language Name/i }).fill('Chinese');
    await createTranscriptionDialog.getByRole('option', { name: /Chinese|中文|汉语|zho/i }).first().click();
    await createTranscriptionDialog.getByPlaceholder(/ISO 639-3/i).fill('zho');
    const createTranscriptionSubmit = createTranscriptionDialog.getByRole('button', {
      name: /^(新建转写层|Create transcription layer|New Transcription Layer)$/i,
    });
    await expect(createTranscriptionSubmit).toBeEnabled();
    await createTranscriptionSubmit.click();
    await expect(createTranscriptionDialog).toBeHidden({ timeout: 15_000 });

    await expect(createTranslationButton).toBeEnabled();
    await createTranslationButton.click();
    const createTranslationDialog = page.getByRole('dialog', { name: /新建翻译层|Create translation layer|New Translation Layer/i });
    await expect(createTranslationDialog).toBeVisible();
    await createTranslationDialog.getByRole('combobox', { name: /语言名称|Language Name/i }).fill('French');
    await createTranslationDialog.getByRole('option', { name: /French|法语|fra/i }).first().click();
    await createTranslationDialog.getByPlaceholder(/ISO 639-3/i).fill('fra');
    const createTranslationSubmit = createTranslationDialog.getByRole('button', {
      name: /^(新建翻译层|Create translation layer|New Translation Layer)$/i,
    });
    await expect(createTranslationSubmit).toBeEnabled();
    await createTranslationSubmit.click();
    await expect(createTranslationDialog).toBeHidden({ timeout: 15_000 });

    // 收回侧栏焦点，避免侧栏层行遮挡轨头指针命中 | Side pane can intercept lane-header clicks
    await page.locator('.left-rail-project-hub-root').click({ timeout: 10_000 }).catch(() => undefined);

    const laneHeader = page.locator('.timeline-lane-header').first();
    await expect(laneHeader).toBeVisible({ timeout: 20_000 });
    await laneHeader.scrollIntoViewIfNeeded();
    await page.keyboard.press('Escape');
    await laneHeader.dispatchEvent('contextmenu');

    const editItem = page.getByRole('menuitem', { name: /编辑该层元信息|Edit layer metadata/i }).last();
    await expect(editItem).toBeVisible({ timeout: 10_000 });
    await editItem.scrollIntoViewIfNeeded();
    await editItem.evaluate((el: HTMLElement) => {
      el.click();
    });

    await expect(page.locator('.layer-action-dialog')).toBeVisible({ timeout: 15_000 });

    const dialog = page.getByRole('dialog', { name: /编辑该层元信息|Edit layer metadata/i });
    await dialog.locator('.layer-action-dialog-header .icon-btn').last().click();
    await expect(page.locator('.layer-action-dialog')).toBeHidden({ timeout: 15_000 });
  });
});
