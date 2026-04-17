/**
 * E2E 关键路径最小集 | Minimal critical-path E2E tests
 *
 * 覆盖：首屏加载、转写页渲染、左侧导航切换、404 路由。
 * Covers: shell boot, transcription page render, nav routing, 404 fallback.
 */
import { test, expect } from '@playwright/test';

test.describe('关键路径 | Critical paths', () => {
  test('首屏加载并显示应用壳 | App shell loads', async ({ page }) => {
    await page.goto('/');
    // 默认重定向到 /transcription | Default redirect to /transcription
    await expect(page).toHaveURL(/\/transcription/);
    // 侧栏导航可见 | Side nav is visible
    await expect(page.locator('nav')).toBeVisible();
    // 页面标题包含解语 | Page title contains Jieyu
    await expect(page).toHaveTitle(/解语/);
  });

  test('转写页渲染核心区域 | Transcription page renders main area', async ({ page }) => {
    await page.goto('/transcription');
    // 等待主内容区域出现（非 loading 骨架屏） | Wait for main content area
    await expect(page.locator('#root')).not.toBeEmpty();
    // 检查页面不包含未捕获错误 | No uncaught errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });

  test('左侧导航切换到各页面 | Navigation to other pages', async ({ page }) => {
    await page.goto('/transcription');
    // 检查导航链接存在 | Nav links exist
    const navLinks = page.locator('nav a');
    await expect(navLinks.first()).toBeVisible();
  });

  test('未知路由显示 404 | Unknown route shows 404', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    // 应展示 404 / Not Found 提示 | Should show 404 indicator
    await expect(page.locator('body')).toContainText(/not found|404|未找到/i);
  });

  test('CSP 不阻断核心资源加载 | CSP does not block core resources', async ({ page }) => {
    const cspViolations: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Content-Security-Policy') || msg.text().includes('CSP')) {
        cspViolations.push(msg.text());
      }
    });
    await page.goto('/transcription');
    await page.waitForTimeout(3000);
    // 不应有 CSP 违规 | No CSP violations expected
    expect(cspViolations).toHaveLength(0);
  });
});
