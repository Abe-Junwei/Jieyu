import { expect, type Page } from '@playwright/test';

/** Opens the transcription floating AI chat window via the FAB (or reuses an already-open window). */
export async function openTranscriptionChatWindow(page: Page): Promise<void> {
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

  const chatWindow = page.locator('.transcription-chat-window');
  const trigger = page.locator('.transcription-chat-window-trigger:not(.is-hidden)');
  // 窗口可能在重载后异步恢复为打开：等二者之一出现 | the window may restore open asynchronously
  await expect(chatWindow.or(trigger).first()).toBeVisible({ timeout: 25_000 });
  if (await chatWindow.count()) {
    await expect(chatWindow).toBeVisible({ timeout: 15_000 });
    return;
  }
  await trigger.click();
  await expect(chatWindow).toBeVisible({ timeout: 15_000 });
}
