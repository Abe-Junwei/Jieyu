/**
 * 侧栏把手（移植自 research-connected）：折叠钮报告展开状态，缩放条支持方向键 / Home / 双击。
 * Sidebar handle (ported from research-connected): the toggle reports its expanded state and the
 * resizer supports arrow keys, Home and double-click.
 */
import { expect, test } from '@playwright/test';
import { setupFieldProjectWithMediaAndSegments } from './_helpers/transcriptionProjectFlow';

test('side pane handle: toggle aria-expanded, keyboard and double-click resize', async ({
  page,
}) => {
  await page.goto('/lexicon');
  const toggle = page.locator('.app-side-pane-collapse-toggle');
  const resizer = page.locator('.app-side-pane-resizer');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
  await expect(resizer).toHaveAttribute('aria-valuenow', '272');

  await resizer.focus();
  await page.keyboard.press('ArrowRight');
  await expect(resizer).toHaveAttribute('aria-valuenow', '296');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(resizer).toHaveAttribute('aria-valuenow', '376');
  await page.keyboard.press('Home');
  await expect(resizer).toHaveAttribute('aria-valuenow', '272');

  await page.keyboard.press('ArrowLeft');
  await expect(resizer).toHaveAttribute('aria-valuenow', '248');
  // 中段被折叠钮盖住，在上方双击 | The toggle covers the middle; double-click above it
  await resizer.dblclick({ position: { x: 4, y: 60 } });
  await expect(resizer).toHaveAttribute('aria-valuenow', '272');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.app-shell-side-pane-collapsed')).toHaveCount(1);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('paired reading editor stays clear of the expanded left pane', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = await setupFieldProjectWithMediaAndSegments(page);
  await page.goto(`/transcription?textId=${project.textId}&mediaId=${project.mediaId}`);
  await page.getByTestId('left-rail-workspace-layout-toggle').click();

  const editor = page.locator('textarea.timeline-paired-reading-source-input').first();
  await expect(editor).toBeVisible();
  await expect(page.locator('.app-side-pane-collapse-toggle')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const bounds = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const { left, right } = element.getBoundingClientRect();
      return { left, right };
    };
    return {
      outerPane: rect('.app-side-pane'),
      editor: rect('textarea.timeline-paired-reading-source-input'),
    };
  });
  expect(bounds.editor.left, JSON.stringify(bounds)).toBeGreaterThanOrEqual(
    bounds.outerPane.right - 2,
  );
  await editor.click();
  await expect(editor).toBeFocused();
  await expect(page.locator('.app-side-pane-collapse-toggle')).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  const sourceRail = page.locator('.timeline-paired-reading-row-rail-source').first();
  const fullLayerName = await sourceRail.getAttribute('title');
  expect(fullLayerName?.length).toBeGreaterThan(2);
  expect(await sourceRail.getAttribute('aria-label')).toContain(fullLayerName);
  expect.soft((await sourceRail.innerText()).trim().length).toBeLessThanOrEqual(2);
  const targetRail = page.locator('.timeline-paired-reading-row-rail-target').first();
  const targetLayerName = await targetRail.getAttribute('title');
  expect(targetLayerName?.length).toBeGreaterThan(2);
  expect(await targetRail.getAttribute('aria-label')).toContain(targetLayerName);
  expect.soft((await targetRail.innerText()).trim().length).toBeLessThanOrEqual(2);
  const statusSize = await page.locator('.waveform-left-status-strip').evaluate((element) => ({
    content: element.scrollHeight,
    visible: element.clientHeight,
  }));
  expect
    .soft(statusSize.content, JSON.stringify(statusSize))
    .toBeLessThanOrEqual(statusSize.visible + 1);

  const resizer = page.locator('.app-side-pane-resizer');
  await resizer.focus();
  await page.keyboard.press('ArrowRight');
  await expect(resizer).toHaveAttribute('aria-valuenow', '296');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const pane = document.querySelector('.app-side-pane')?.getBoundingClientRect();
        const input = document
          .querySelector('textarea.timeline-paired-reading-source-input')
          ?.getBoundingClientRect();
        if (!pane || !input) throw new Error('Missing pane or editor');
        return input.left - pane.right;
      }),
    )
    .toBeGreaterThanOrEqual(-2);

  await page.locator('.app-side-pane-collapse-toggle').click();
  await expect(page.locator('.app-side-pane-collapse-toggle')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(editor).toBeVisible();
  await expect
    .poll(() => editor.boundingBox().then((box) => box?.x ?? Infinity))
    .toBeLessThan(bounds.editor.left - 200);

  await page.locator('.app-side-pane-collapse-toggle').click();
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.locator('.app-side-pane')).toBeHidden();
  await expect(editor).toBeVisible();
  expect(
    await page
      .locator('.app-main-transcription')
      .evaluate((element) => getComputedStyle(element).paddingLeft),
  ).toBe('0px');
});
