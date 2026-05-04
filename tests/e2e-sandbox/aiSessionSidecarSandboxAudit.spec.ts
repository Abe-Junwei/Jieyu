/**
 * F4：在 **仅本 spec 使用的构建**（`VITE_AI_BACKGROUND_TOOL_SANDBOX_ENABLED` + readonly profile）下，
 * send-preflight / 置顶 directive 阻断时应在 Dexie `audit_logs` 出现 `ai_session_sidecar_sandbox`。
 *
 * 运行：`npm run test:e2e:session-sidecar-audit`（`playwright.session-sidecar.config.ts`，Chromium only）。
 */
import { expect, test, type Page } from '@playwright/test';

async function countSessionSidecarAuditRows(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const dexie = (globalThis as unknown as {
      __jieyuDexie__?: {
        open: () => Promise<unknown>;
        audit_logs: { toArray: () => Promise<Array<{ field?: string }>> };
      };
    }).__jieyuDexie__;
    if (!dexie) return -1;
    await dexie.open();
    const rows = await dexie.audit_logs.toArray();
    return rows.filter((row) => row.field === 'ai_session_sidecar_sandbox').length;
  });
}

async function hasSessionSidecarAuditGateContaining(page: Page, needle: string): Promise<boolean> {
  return page.evaluate(async (gateNeedle) => {
    const dexie = (globalThis as unknown as {
      __jieyuDexie__?: {
        open: () => Promise<unknown>;
        audit_logs: { toArray: () => Promise<Array<{ field?: string; metadataJson?: string }>> };
      };
    }).__jieyuDexie__;
    if (!dexie) return false;
    await dexie.open();
    const rows = await dexie.audit_logs.toArray();
    for (const row of rows) {
      if (row.field !== 'ai_session_sidecar_sandbox' || !row.metadataJson) continue;
      try {
        const meta = JSON.parse(row.metadataJson) as { gate?: string };
        if (typeof meta.gate === 'string' && meta.gate.includes(gateNeedle)) return true;
      } catch {
        /* skip */
      }
    }
    return false;
  }, needle);
}

async function openTranscriptionAiComposer(page: Page): Promise<void> {
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('.transcription-ai-panel')).toBeAttached({ timeout: 25_000 });

  const hoverZone = page.locator('.transcription-ai-panel-hover-zone');
  if (await hoverZone.count()) {
    await hoverZone.hover({ force: true });
  } else {
    await page.getByRole('button', { name: /Expand AI panel|展开/i }).click({ force: true });
  }

  await expect(page.getByTestId('ai-chat-composer-input')).toBeAttached({ timeout: 60_000 });

  await page.waitForFunction(
    () => Boolean((globalThis as unknown as { __jieyuDexie__?: { open: () => Promise<unknown> } }).__jieyuDexie__),
    { timeout: 25_000 },
  );
}

test.describe('F4 session sidecar sandbox audit (readonly build)', () => {
  test('send-preflight directive block writes ai_session_sidecar_sandbox audit row', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await openTranscriptionAiComposer(page);

    const before = await countSessionSidecarAuditRows(page);
    expect(before).toBeGreaterThanOrEqual(0);

    const composer = page.getByTestId('ai-chat-composer-input');
    await composer.fill('请记住：所有回答用英文');
    await page.locator('.ai-chat-composer-send-btn').click();

    await expect.poll(async () => countSessionSidecarAuditRows(page), {
      timeout: 25_000,
      intervals: [200, 400, 800, 1200],
    }).toBeGreaterThan(before);

    expect(await hasSessionSidecarAuditGateContaining(page, 'send-preflight')).toBe(true);

    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

  test('pinned user directive block writes ai_session_sidecar_sandbox audit row', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await openTranscriptionAiComposer(page);

    const directiveText = '请记住：全部用中文回答';
    await page.getByTestId('ai-chat-composer-input').fill(directiveText);
    await page.locator('.ai-chat-composer-send-btn').click();

    await expect(page.locator('.ai-chat-message-user').filter({ hasText: directiveText })).toBeVisible({
      timeout: 25_000,
    });

    const userBubble = page.locator('.ai-chat-message-user').filter({ hasText: directiveText });
    // Pin sits beside `.ai-chat-message-surface`; default hit-testing can be blocked by the surface overlay.
    await userBubble.locator('.ai-chat-message-pin-btn').click({ force: true });

    await expect.poll(async () => hasSessionSidecarAuditGateContaining(page, 'pinned-message-directive'), {
      timeout: 25_000,
      intervals: [200, 400, 800, 1200],
    }).toBe(true);

    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });
});
