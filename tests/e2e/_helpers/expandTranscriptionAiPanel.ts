import { expect, type Page } from '@playwright/test';

/** Opens the default-collapsed transcription sidebar AI panel (hover with click fallback). */
export async function expandTranscriptionAiPanel(page: Page): Promise<void> {
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('.transcription-ai-panel')).toBeAttached({ timeout: 25_000 });

  const hoverZone = page.locator('.transcription-ai-panel-hover-zone');
  const expandButton = page.getByRole('button', { name: /Expand AI panel|展开/i });
  if (await hoverZone.count()) {
    await hoverZone.waitFor({ state: 'visible', timeout: 10_000 });
    await hoverZone.hover({ force: true });
    try {
      await expect(
        page.locator('.transcription-ai-panel-handle-cluster.transcription-ai-panel-handle-collapsed'),
      ).toBeHidden({ timeout: 5_000 });
    } catch {
      if (await expandButton.count()) {
        await expandButton.click({ force: true });
      }
    }
  } else if (await expandButton.count()) {
    await expandButton.click({ force: true });
  }
}
