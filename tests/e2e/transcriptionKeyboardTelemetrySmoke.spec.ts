/**
 * 转写页键盘快捷键烟测：确保全局快捷键在可聚焦区域触发时不抛错。
 * Keyboard smoke on transcription: global shortcut path must not throw.
 */
import { test, expect } from '@playwright/test';

test.describe('转写键盘遥测烟测 | Transcription keyboard telemetry smoke', () => {
  test('全局快捷键路径可触发且无未捕获异常 | Global shortcut path fires without page errors', async ({ page, browserName }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      const message = err.message;
      if (browserName === 'webkit' && message.includes("Unexpected identifier 'AiStateWorkerRequest'")) {
        return;
      }
      errors.push(message);
    });

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    // 避开 input/contenteditable，使全局快捷键处理器生效 | Avoid inputs so global keybindings run
    await page.locator('.left-rail-project-hub-root').click({ timeout: 10_000 });

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+N`);
    await page.keyboard.press(`${modifier}+Z`);
    await page.keyboard.press(`${modifier}+Shift+Z`);

    await page.waitForTimeout(300);
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('时间轴区滚轮可驱动横向滚动 | Timeline wheel pans horizontally', async ({ page }) => {
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    const timelineScroller = page.locator('.timeline-scroll').first();
    await expect(timelineScroller).toBeVisible({ timeout: 10_000 });

    // 注入一个最小宽度扩展器，确保横向滚动可观测 | Inject a minimal width spacer so horizontal pan is observable
    const overflowReady = await page.evaluate(() => {
      const scroller = document.querySelector('.timeline-scroll') as HTMLDivElement | null;
      if (!scroller) return false;
      const existing = scroller.querySelector('[data-e2e-wheel-overflow-spacer="1"]');
      if (!existing) {
        const spacer = document.createElement('div');
        spacer.setAttribute('data-e2e-wheel-overflow-spacer', '1');
        spacer.style.width = '12000px';
        spacer.style.height = '1px';
        spacer.style.pointerEvents = 'none';
        scroller.appendChild(spacer);
      }
      return scroller.scrollWidth > scroller.clientWidth;
    });
    expect(overflowReady).toBe(true);

    await page.evaluate(() => {
      const scroller = document.querySelector('.timeline-scroll') as HTMLDivElement | null;
      if (scroller) scroller.scrollLeft = 0;
    });

    const before = await timelineScroller.evaluate((node) => node.scrollLeft);
    await timelineScroller.hover();
    await page.mouse.wheel(0, 480);
    await page.waitForTimeout(120);
    const after = await timelineScroller.evaluate((node) => node.scrollLeft);

    expect(after).toBeGreaterThan(before);
  });
});
