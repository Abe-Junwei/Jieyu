/**
 * R1：flag `aiAgentRuntimeV2Enabled` 关时聊天回合与 1d65fef8 一致（v2 运行时分块从不加载，旧文本路径执行工具），
 * 且该工具调用可按 requestId 读回审计回放所需的意图 + 决策记录（loadAiToolReplayBundle 的数据源）。
 * R1: with the v2 flag off the turn stays on the legacy path, and the tool call's audit rows
 * (intent + decision, the replay bundle source) read back by requestId.
 */
import { expect, test } from '@playwright/test';
import { setupFieldProjectWithMediaAndSegments } from './_helpers/transcriptionProjectFlow';
import { openTranscriptionChatWindow } from './_helpers/openTranscriptionChatWindow';

type AuditRow = { field: string; requestId?: string; newValue?: string; metadataJson?: string; timestamp: string };

test.describe('AI runtime v2 flag off + audit replay', () => {
  test('flag off keeps the legacy path; tool decision reads back by requestId', async ({ page }) => {
    test.setTimeout(120_000);
    const requested: string[] = [];
    page.on('request', (req) => requested.push(req.url()));

    await setupFieldProjectWithMediaAndSegments(page);
    await openTranscriptionChatWindow(page);
    await page.getByRole('button', { name: /00:00\.0.*alpha/ }).first().click();
    const chat = page.locator('.transcription-chat-window');
    const input = chat.getByTestId('ai-chat-composer-input');
    await expect(input).toBeVisible({ timeout: 60_000 });

    // Mock provider 对“创建句段”回复 create_transcription_segment（旧文本协议）
    await input.fill('创建一个句段');
    await input.press('Enter');
    await expect(chat.getByText(/Completed "创建句段"|已完成.*创建句段/).first()).toBeVisible({ timeout: 30_000 });

    const rows = await page.evaluate(async () => {
      const dexie = (globalThis as unknown as {
        __jieyuDexie__: { open: () => Promise<unknown>; audit_logs: { toArray: () => Promise<AuditRow[]> } };
      }).__jieyuDexie__;
      await dexie.open();
      return (await dexie.audit_logs.toArray()).filter((r) => r.field.startsWith('ai_tool_call_'));
    });
    const decision = rows.find((r) => r.field === 'ai_tool_call_decision' && r.newValue?.includes('create_transcription_segment'));
    expect(decision?.requestId).toMatch(/^toolreq_/);
    const byRequest = rows.filter((r) => r.requestId === decision!.requestId);
    expect(byRequest.map((r) => r.field)).toEqual(
      expect.arrayContaining(['ai_tool_call_intent', 'ai_tool_call_decision']),
    );
    const meta = JSON.parse(decision!.metadataJson ?? '{}') as { requestId?: string; executed?: boolean; toolCall?: { name?: string } };
    expect(meta).toMatchObject({ requestId: decision!.requestId, executed: true, toolCall: { name: 'create_transcription_segment' } });

    // flag 关：v2 运行时分块从未请求 | flag off: the v2 runtime chunk is never requested
    expect(requested.filter((u) => /aiRuntimeV2Turn|toolLoopAgentPilot/.test(u))).toEqual([]);
  });
});
