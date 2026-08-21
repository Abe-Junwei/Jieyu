import { expect, type Page } from '@playwright/test';
import { openTranscriptionChatWindow } from './openTranscriptionChatWindow';

/**
 * Legacy helper name: the transcription AI dock is gone (ADR-0033).
 * Opens the floating chat window instead.
 */
export async function expandTranscriptionAiPanel(page: Page): Promise<void> {
  await openTranscriptionChatWindow(page);
  await expect(page.locator('.transcription-chat-window')).toBeVisible({ timeout: 15_000 });
}
