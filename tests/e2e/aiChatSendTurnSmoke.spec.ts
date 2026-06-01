/**
 * AI 聊天输入壳烟测（无真实模型调用）。
 * Smoke anchor for AI chat composer shell (no model calls).
 */
import { expect, test } from '@playwright/test';
import { expandTranscriptionAiPanel } from './_helpers/expandTranscriptionAiPanel';

test.describe('AI chat send-turn shell smoke', () => {
  test('转写页侧栏聊天输入壳挂载 | Transcription AI composer shell mounted', async ({ page, browserName }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      const message = err.message;
      if (browserName === 'webkit' && message.includes("Unexpected identifier 'AiStateWorkerRequest'")) {
        return;
      }
      errors.push(message);
    });

    await expandTranscriptionAiPanel(page);
    await expect(page.getByTestId('ai-chat-composer-input')).toBeAttached({ timeout: 60_000 });

    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });
});
