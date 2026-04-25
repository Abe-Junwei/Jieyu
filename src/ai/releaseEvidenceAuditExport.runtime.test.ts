// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { db } from '../db';
import { useAiChatToolAudit } from '../hooks/useAiChat.toolAudit';
import type { AiChatToolCall } from '../hooks/useAiChat.types';
import type { ToolAuditContext, ToolDecisionAuditMetadata } from './chat/toolCallHelpers';

const DEFAULT_OUTPUT_RELATIVE_PATH = 'docs/execution/audits/ai-tool-decision-audit-export-v1.ndjson';
const DEFAULT_REQUEST_ID = 'toolreq_runtime_ci_001';

function resolveExportOutputPath(): string {
  const configured = String(process.env.RELEASE_EVIDENCE_AI_AUDIT_EXPORT ?? '').trim();
  if (!configured) {
    return path.join(process.cwd(), DEFAULT_OUTPUT_RELATIVE_PATH);
  }
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function resolveRequestId(): string {
  const configured = String(process.env.RELEASE_EVIDENCE_AI_REQUEST_IDS ?? '').trim();
  if (!configured) return DEFAULT_REQUEST_ID;
  const first = configured
    .split(',')
    .map((item) => item.trim())
    .find(Boolean);
  return first ?? DEFAULT_REQUEST_ID;
}

async function clearAuditLogs(): Promise<void> {
  await db.audit_logs.clear();
}

describe('release evidence ai audit export runtime', () => {
  beforeEach(async () => {
    await db.open();
    await clearAuditLogs();
  });

  afterEach(async () => {
    await clearAuditLogs();
  });

  it('writes audit_export ndjson from runtime tool-audit write path', async () => {
    const requestId = resolveRequestId();
    const assistantMessageId = 'assistant-release-evidence-runtime';
    const outputPath = resolveExportOutputPath();

    const toolCall: AiChatToolCall = {
      name: 'delete_transcription_segment',
      arguments: { segmentId: 'seg_runtime_ci_001' },
      requestId,
    };

    const context: ToolAuditContext = {
      userText: '请删除当前语段',
      providerId: 'mock',
      model: 'runtime-export',
      toolDecisionMode: 'enabled',
      toolFeedbackStyle: 'concise',
      plannerDecision: 'resolved',
    };

    const metadata: ToolDecisionAuditMetadata = {
      schemaVersion: 1,
      phase: 'decision',
      requestId,
      assistantMessageId,
      source: 'ai',
      toolCall,
      context,
      executed: true,
      outcome: 'confirmed',
      message: 'runtime export seed',
    };

    const { result } = renderHook(() => useAiChatToolAudit());
    await result.current.writeToolDecisionAuditLog(
      assistantMessageId,
      'pending:delete_transcription_segment',
      'confirmed:delete_transcription_segment',
      'ai',
      requestId,
      metadata,
    );

    const rows = await db.audit_logs
      .where('[collection+field+requestId]')
      .equals(['ai_messages', 'ai_tool_call_decision', requestId])
      .toArray();

    expect(rows.length).toBeGreaterThan(0);

    const normalizedLines = [...rows]
      .sort((left, right) => String(left.timestamp ?? '').localeCompare(String(right.timestamp ?? '')))
      .map((row) => JSON.stringify({
        id: row.id,
        collection: row.collection,
        documentId: row.documentId,
        action: row.action,
        field: row.field,
        oldValue: row.oldValue,
        newValue: row.newValue,
        source: row.source,
        timestamp: row.timestamp,
        requestId: row.requestId,
        metadataJson: row.metadataJson,
      }));

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${normalizedLines.join('\n')}\n`, 'utf8');

    const exportedText = await readFile(outputPath, 'utf8');
    const firstLine = exportedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    expect(firstLine).toBeTruthy();
    const exportedRow = JSON.parse(firstLine ?? '{}') as {
      requestId?: string;
      newValue?: string;
      metadataJson?: string;
    };
    expect(exportedRow.requestId).toBe(requestId);
    expect(typeof exportedRow.newValue).toBe('string');
    expect((exportedRow.newValue ?? '').trim().length).toBeGreaterThan(0);
    expect(typeof exportedRow.metadataJson).toBe('string');
    expect((exportedRow.metadataJson ?? '').trim().length).toBeGreaterThan(0);
  });
});