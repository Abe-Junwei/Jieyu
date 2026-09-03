// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { db } from '../db';
import { useAiChatToolAudit } from '../hooks/ai/useAiChat.toolAudit';
import type { AiChatToolCall } from '../hooks/ai/useAiChat.types';
import type {
  ToolAuditContext,
  ToolDecisionAuditMetadata,
  ToolIntentAuditMetadata,
} from './chat/toolCallHelpers';

const DEFAULT_OUTPUT_RELATIVE_PATH =
  'docs/execution/audits/ai-tool-decision-audit-export-v1.ndjson';
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

function nowIso(): string {
  return new Date().toISOString();
}

function newAuditLogId(): string {
  return `audit_${nowIso()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function clearAuditLogs(): Promise<void> {
  await db.audit_logs.clear();
}

async function seedBackgroundMemoryAuditRows(requestId: string): Promise<void> {
  const timestamp = nowIso();
  await db.audit_logs.add({
    id: newAuditLogId(),
    collection: 'ai_messages',
    documentId: 'assistant-release-evidence-runtime',
    action: 'update',
    field: 'ai_background_memory_extraction',
    oldValue: 'scheduled',
    newValue: 'completed',
    source: 'ai',
    timestamp,
    requestId: `bgmem_${requestId}`,
    metadataJson: JSON.stringify({
      schemaVersion: 1,
      phase: 'background_memory_extraction',
      taskId: `bgmem_${requestId}`,
      actorId: 'ai-chat',
      status: 'completed',
      inputRange: { conversationId: 'conv-release-evidence', startIndex: 0, endIndex: 2 },
      writtenCount: 3,
      durationMs: 120,
      sandboxDecision: { action: 'allow', reason: 'within_quota' },
    }),
  });
}

async function seedCoordinationLiteAuditRows(requestId: string): Promise<void> {
  const timestamp = nowIso();
  await db.audit_logs.add({
    id: newAuditLogId(),
    collection: 'ai_messages',
    documentId: 'assistant-release-evidence-runtime',
    action: 'update',
    field: 'ai_coordination_lite',
    oldValue: `step:coord_${requestId}`,
    newValue: 'completed',
    source: 'ai',
    timestamp,
    requestId: `coord_${requestId}`,
    metadataJson: JSON.stringify({
      schemaVersion: 1,
      phase: 'coordination_lite',
      taskSessionId: `session_${requestId}`,
      notification: {
        taskId: `coord_${requestId}`,
        status: 'completed',
        phase: 'execute',
        taskType: 'tool_call',
        usage: { durationMs: 85 },
      },
      parallelPolicy: { canRunInParallel: true, reason: 'readonly-parallel' },
      quarantinedCount: 0,
    }),
  });
}

async function seedAgentLoopStepAuditRow(
  agentRunId: string,
  assistantMessageId: string,
): Promise<void> {
  const timestamp = nowIso();
  await db.audit_logs.add({
    id: newAuditLogId(),
    collection: 'ai_messages',
    documentId: assistantMessageId,
    action: 'update',
    field: 'ai_agent_loop_step',
    oldValue: 'step:1',
    newValue: 'done',
    source: 'ai',
    timestamp,
    requestId: `${assistantMessageId}_loop_1`,
    metadataJson: JSON.stringify({
      schemaVersion: 1,
      phase: 'agent_loop_step',
      requestId: `${assistantMessageId}_loop_1`,
      step: 1,
      maxSteps: 6,
      agentRunId,
      inputSummary: 'runtime export seed loop',
      outputSummary: 'done',
      durationMs: 40,
      reportedTokens: 12,
    }),
  });
}

async function seedRecoveryDecisionAuditRow(agentRunId: string): Promise<void> {
  await db.audit_logs.add({
    id: 'audit_2026-06-25T12:15:30.122Z_recovery_seed',
    collection: 'ai_messages',
    documentId: 'assistant-release-evidence-runtime',
    action: 'update',
    field: 'ai_tool_call_decision',
    oldValue: 'pending:set_transcription_text',
    newValue: 'policy_pending:set_transcription_text',
    source: 'ai',
    timestamp: '2026-06-24T10:00:00.000Z',
    requestId: 'toolreq_runtime_ci_002',
    metadataJson: JSON.stringify({
      schemaVersion: 1,
      phase: 'decision',
      requestId: 'toolreq_runtime_ci_002',
      assistantMessageId: 'assistant-release-evidence-runtime',
      source: 'ai',
      agentRunId,
      toolCall: {
        name: 'set_transcription_text',
        arguments: { text: 'recovery seed' },
        requestId: 'toolreq_runtime_ci_002',
      },
      outcome: 'policy_pending',
      reason: 'user_directive_confirmation_required',
      message: 'recovery export seed',
    }),
  });
}

async function seedUserDirectiveGovernanceAuditRows(requestId: string): Promise<void> {
  const timestamp = nowIso();
  await db.audit_logs.add({
    id: newAuditLogId(),
    collection: 'ai_messages',
    documentId: 'assistant-release-evidence-runtime',
    action: 'update',
    field: 'ai_user_directive_extraction',
    oldValue: '',
    newValue: 'extracted:2',
    source: 'ai',
    timestamp,
    requestId: `directive_extract_${timestamp}`,
    metadataJson: JSON.stringify({
      schemaVersion: 1,
      phase: 'user_directive_extraction',
      summary: {
        extractedCount: 2,
        acceptedCount: 1,
        ignoredCount: 0,
        downgradedCount: 1,
        supersededCount: 0,
        categories: { safety: 1, formatting: 1 },
      },
      ledgerEntries: [],
    }),
  });

  await db.audit_logs.add({
    id: newAuditLogId(),
    collection: 'ai_messages',
    documentId: 'assistant-release-evidence-runtime',
    action: 'update',
    field: 'ai_user_directive_application',
    oldValue: '',
    newValue: 'accepted:1;ignored:0;downgraded:1;superseded:0',
    source: 'ai',
    timestamp,
    requestId: `directive_${timestamp}`,
    metadataJson: JSON.stringify({
      schemaVersion: 1,
      phase: 'user_directive_application',
      summary: {
        extractedCount: 2,
        acceptedCount: 1,
        ignoredCount: 0,
        downgradedCount: 1,
        supersededCount: 0,
        categories: { safety: 1, formatting: 1 },
      },
      ledgerEntries: [],
    }),
  });

  await db.audit_logs.add({
    id: newAuditLogId(),
    collection: 'ai_messages',
    documentId: 'assistant-release-evidence-runtime',
    action: 'update',
    field: 'ai_response_policy_resolution',
    oldValue: '',
    newValue: 'zh-CN',
    source: 'ai',
    timestamp,
    requestId: `${requestId}_response_policy`,
    metadataJson: JSON.stringify({
      schemaVersion: 1,
      phase: 'response_policy_resolution',
      policy: {
        language: 'zh-CN',
        locale: 'zh-CN',
        style: 'detailed',
        format: 'bullets',
        evidenceRequired: true,
      },
    }),
  });
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

    const agentRunId = 'run_runtime_ci_001';
    const context: ToolAuditContext = {
      userText: '请删除当前语段',
      providerId: 'mock',
      model: 'runtime-export',
      toolDecisionMode: 'enabled',
      toolFeedbackStyle: 'concise',
      plannerDecision: 'resolved',
      agentRunId,
    };

    const metadata: ToolDecisionAuditMetadata = {
      schemaVersion: 1,
      phase: 'decision',
      requestId,
      assistantMessageId,
      source: 'ai',
      toolCall,
      context,
      agentRunId,
      executed: true,
      outcome: 'confirmed',
      message: 'runtime export seed',
      memoryRecallShape: {
        candidateCount: 12,
        selectedCount: 5,
        duplicateSuppressedCount: 2,
        budgetSuppressedCount: 1,
        freshnessBucket: 'recent',
      },
      executionProgress: { appliedCount: 0, totalCount: 2, partial: true },
      proposeRollback: { attempted: true, ok: false, errorCount: 1 },
    };

    const intentMetadata: ToolIntentAuditMetadata = {
      schemaVersion: 1,
      phase: 'intent',
      requestId,
      assistantMessageId,
      toolCall,
      context,
      agentRunId,
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
    await result.current.writeToolIntentAuditLog(
      assistantMessageId,
      'delete_transcription_segment',
      {
        decision: 'execute',
        score: 5,
        hasExecutionCue: true,
        hasActionVerb: true,
        hasActionTarget: true,
        hasExplicitId: true,
        hasMetaQuestion: false,
        hasTechnicalDiscussion: false,
      },
      requestId,
      intentMetadata,
    );

    // Seed additional audit rows for downstream evidence cards + A14 chain / A4 recovery.
    await seedBackgroundMemoryAuditRows(requestId);
    await seedCoordinationLiteAuditRows(requestId);
    await seedUserDirectiveGovernanceAuditRows(requestId);
    await seedAgentLoopStepAuditRow(agentRunId, assistantMessageId);
    await seedRecoveryDecisionAuditRow('run_runtime_ci_002');

    const rows = await db.audit_logs.where('collection').equals('ai_messages').toArray();

    expect(rows.length).toBeGreaterThanOrEqual(4);

    const normalizedLines = [...rows]
      .sort((left, right) =>
        String(left.timestamp ?? '').localeCompare(String(right.timestamp ?? '')),
      )
      .map((row) =>
        JSON.stringify({
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
        }),
      );

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${normalizedLines.join('\n')}\n`, 'utf8');

    const exportedText = await readFile(outputPath, 'utf8');
    const allParsedRows = exportedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as {
            field?: string;
            requestId?: string;
            newValue?: string;
            metadataJson?: string;
          },
      );

    const decisionExportRow = allParsedRows.find(
      (r) => r.field === 'ai_tool_call_decision' && r.requestId === requestId,
    );
    expect(decisionExportRow).toBeTruthy();
    expect(decisionExportRow!.requestId).toBe(requestId);
    expect(typeof decisionExportRow!.newValue).toBe('string');
    expect((decisionExportRow!.newValue ?? '').trim().length).toBeGreaterThan(0);
    expect(typeof decisionExportRow!.metadataJson).toBe('string');
    expect((decisionExportRow!.metadataJson ?? '').trim().length).toBeGreaterThan(0);

    // Verify downstream evidence fields are present
    const allRows = allParsedRows;

    const fields = new Set(allRows.map((r) => r.field).filter(Boolean));
    expect(fields.has('ai_tool_call_decision')).toBe(true);
    expect(fields.has('ai_tool_call_intent')).toBe(true);
    expect(fields.has('ai_agent_loop_step')).toBe(true);
    expect(fields.has('ai_background_memory_extraction')).toBe(true);
    expect(fields.has('ai_coordination_lite')).toBe(true);
    expect(fields.has('ai_user_directive_extraction')).toBe(true);
    expect(fields.has('ai_user_directive_application')).toBe(true);
    expect(fields.has('ai_response_policy_resolution')).toBe(true);

    const decisionRows = allRows.filter((r) => r.field === 'ai_tool_call_decision');
    expect(decisionRows).toHaveLength(2);
    expect(decisionRows.some((r) => r.requestId === 'toolreq_runtime_ci_002')).toBe(true);

    const decisionRow = allRows.find(
      (r) => r.field === 'ai_tool_call_decision' && r.requestId === requestId,
    );
    expect(decisionRow).toBeTruthy();
    const decisionMeta = JSON.parse(decisionRow?.metadataJson ?? '{}') as Record<string, unknown>;
    expect(decisionMeta.memoryRecallShape).toBeTruthy();
    expect((decisionMeta.executionProgress as { partial?: boolean } | undefined)?.partial).toBe(
      true,
    );
    expect(
      Number((decisionMeta.proposeRollback as { errorCount?: number } | undefined)?.errorCount),
    ).toBe(1);
    expect(decisionMeta.agentRunId).toBe(agentRunId);
    expect((decisionMeta.context as { agentRunId?: string } | undefined)?.agentRunId).toBe(
      agentRunId,
    );

    const intentRow = allRows.find((r) => r.field === 'ai_tool_call_intent');
    expect(intentRow).toBeTruthy();
    const intentMeta = JSON.parse(intentRow?.metadataJson ?? '{}') as Record<string, unknown>;
    expect(intentMeta.agentRunId).toBe(agentRunId);

    const loopRow = allRows.find((r) => r.field === 'ai_agent_loop_step');
    expect(loopRow).toBeTruthy();
    const loopMeta = JSON.parse(loopRow?.metadataJson ?? '{}') as Record<string, unknown>;
    expect(loopMeta.agentRunId).toBe(agentRunId);
  });
});
