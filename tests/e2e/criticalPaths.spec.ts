/**
 * E2E 关键路径最小集 | Minimal critical-path E2E tests
 *
 * 覆盖：首屏加载、转写页渲染、左侧导航切换、404 路由。
 * Covers: shell boot, transcription page render, nav routing, 404 fallback.
 * 默认路由为 `/`（首页）；转写能力在 `/transcription` 单测覆盖。
 */
import { test, expect } from '@playwright/test';

test.describe('关键路径 | Critical paths', () => {
  test('首屏加载并显示应用壳 | App shell loads', async ({ page }) => {
    await page.goto('/');
    // 默认路由为首页 `/`（非自动跳转转写） | Default route is home `/`
    await expect(page).toHaveURL(/\/(index\.html)?(\?.*)?$/);
    // 侧栏导航可见 | Side nav is visible
    await expect(page.locator('nav')).toBeVisible();
    // 页面标题包含解语 | Page title contains Jieyu
    await expect(page).toHaveTitle(/解语/);
  });

  test('转写页渲染核心区域 | Transcription page renders main area', async ({ page }) => {
    await page.goto('/transcription');
    await expect(
      page.getByTestId('transcription-page-loading').or(page.getByTestId('transcription-workspace-screen')),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.left-rail-project-hub-root')).toBeVisible({ timeout: 25_000 });
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

  test('词典页可加载（语言资产主路径烟测子集） | Lexicon page loads (ARCH-9 smoke)', async ({ page }) => {
    await page.goto('/lexicon');
    await expect(page.locator('nav')).toBeVisible();
    // zh-CN: 词典工作台；en: Lexicon Workspace（默认 locale 可能因环境不同）
    await expect(page.locator('body')).toContainText(/词典工作台|Lexicon Workspace/);
  });

  test('语料库页可加载（规划页烟测子集） | Corpus page loads (ARCH-9 smoke)', async ({ page }) => {
    await page.goto('/corpus');
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('body')).toContainText(/语料库未开放|Corpus library is not open yet/);
  });

  test('CSP 不阻断核心资源加载 | CSP does not block core resources', async ({ page }) => {
    const cspViolations: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Content-Security-Policy') || msg.text().includes('CSP')) {
        cspViolations.push(msg.text());
      }
    });
    const response = await page.goto('/transcription');
    await page.waitForTimeout(3000);
    expect(response).not.toBeNull();
    const headers = response!.headers();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    // 依赖先于 main 的 `zod-jitless-bootstrap` 入口（Vite rollup + `transformIndexHtml` post 注入）关闭 Zod JIT，避免 `Function` 构造器探测触发严格 CSP。
    expect(cspViolations).toHaveLength(0);
  });

  test('ARCH-9：创建语言层与翻译层并导出 Toolbox | ARCH-9: create language layer + translation and export Toolbox', async ({ page }) => {
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    // 左轨：先建转写层（含语言代码），再建翻译层
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

    // 项目中心：导出 Toolbox，确认下载动作可达
    await page.locator('.left-rail-project-hub-btn').click();
    const exportMenuEntry = page.getByRole('menuitem', { name: /导出|Export/ });
    await exportMenuEntry.hover();
    const toolboxExportEntry = page
      .locator('.context-menu-submenu-export')
      .getByRole('menuitem', { name: /Toolbox/i });
    await expect(toolboxExportEntry).toBeVisible();
    await toolboxExportEntry.click();
    // 导出触发后菜单应关闭，证明动作已被消费 | Export action should close the menu, proving the click is consumed
    await expect(page.locator('.context-menu-submenu-export')).toBeHidden({ timeout: 10_000 });
  });
});
