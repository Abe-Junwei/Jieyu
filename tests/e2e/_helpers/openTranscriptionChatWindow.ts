import { expect, type Page } from '@playwright/test';

/** Opens the transcription floating AI chat window via the FAB (or reuses an already-open window). */
export async function openTranscriptionChatWindow(page: Page): Promise<void> {
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

  const chatWindow = page.locator('.transcription-chat-window');
  if (await chatWindow.count()) {
    await expect(chatWindow).toBeVisible({ timeout: 15_000 });
    return;
  }

  const trigger = page.locator('.transcription-chat-window-trigger:not(.is-hidden)');
  await expect(trigger).toBeVisible({ timeout: 25_000 });
  await trigger.click();
  await expect(chatWindow).toBeVisible({ timeout: 15_000 });
}
