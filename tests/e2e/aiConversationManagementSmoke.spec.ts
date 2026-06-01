/**
 * G1f: conversation management chrome smoke (no model calls).
 */
import { expect, test } from '@playwright/test';
import { expandTranscriptionAiPanel } from './_helpers/expandTranscriptionAiPanel';

test.describe('AI conversation management smoke', () => {
  test('shows conversation list controls in sidebar AI header', async ({ page, browserName }) => {
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

    const listButton = page.getByRole('button', {
      name: /Conversation list|会话列表/i,
    });
    await expect(listButton).toBeVisible({ timeout: 15_000 });

    const titleButton = page.getByRole('button', {
      name: /Current conversation title|当前会话标题/i,
    });
    await expect(titleButton).toBeVisible();

    await listButton.click();
    const popover = page.locator('.ai-conversation-list-popover');
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await expect(
      popover.getByRole('button', { name: /New chat|新对话/i }),
    ).toBeVisible();

    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });
});
