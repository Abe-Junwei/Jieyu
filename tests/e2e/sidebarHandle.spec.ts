/**
 * 侧栏把手（移植自 research-connected）：折叠钮报告展开状态，缩放条支持方向键 / Home / 双击。
 * Sidebar handle (ported from research-connected): the toggle reports its expanded state and the
 * resizer supports arrow keys, Home and double-click.
 */
import { expect, test } from '@playwright/test';

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
