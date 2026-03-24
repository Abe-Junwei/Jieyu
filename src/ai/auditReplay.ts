import { db as appDb } from '../db';
import { mapAuditRowToAiToolDecisionLog, type AiToolDecisionLogItem } from './toolDecisionLog';

type AuditSource = 'human' | 'ai' | 'system';

interface AiToolCallSnapshot {
  name?: string;
  arguments?: Record<string, unknown>;
  requestId?: string;
}

interface ToolIntentAuditMetadataLike {
  phase?: 'intent';
  requestId?: string;
  assistantMessageId?: string;
  toolCall?: AiToolCallSnapshot;
  context?: Record<string, unknown>;
}

interface ToolDecisionAuditMetadataLike {
  phase?: 'decision';
  requestId?: string;
  assistantMessageId?: string;
  toolCall?: AiToolCallSnapshot;
  context?: Record<string, unknown>;
  executed?: boolean;
  outcome?: string;
  message?: string;
  reason?: string;
}

export interface AiToolReplayDecision extends AiToolDecisionLogItem {
  source: AuditSource;
  executed?: boolean;
  message?: string;
  assistantMessageId?: string;
  toolCall?: AiToolCallSnapshot;
  context?: Record<string, unknown>;
}

export interface AiToolReplayBundle {
  requestId: string;
  toolName: string;
  replayable: boolean;
  toolCall?: AiToolCallSnapshot;
  context?: Record<string, unknown>;
  assistantMessageId?: string;
  intentAssessment?: unknown;
  decisions: AiToolReplayDecision[];
  latestDecision?: AiToolReplayDecision;
}

export interface AiToolGoldenSnapshot {
  schemaVersion: 1;
  exportedAt: string;
  requestId: string;
  toolName: string;
  replayable: boolean;
  assistantMessageId?: string;
  toolCall?: AiToolCallSnapshot;
  context?: Record<string, unknown>;
  intentAssessment?: unknown;
  latestDecision?: {
    decision: string;
    reason?: string;
    executed?: boolean;
    source: AuditSource;
    timestamp: string;
    message?: string;
  };
  decisions: Array<{
    decision: string;
    reason?: string;
    executed?: boolean;
    source: AuditSource;
    timestamp: string;
    message?: string;
  }>;
}

function compareIsoTimestampAsc(left: { timestamp: string }, right: { timestamp: string }): number {
  return left.timestamp.localeCompare(right.timestamp);
}

function safeParseJson(raw: string | undefined): unknown {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    console.error('[Jieyu] auditReplay: safeParseJson failed', { raw, err });
    return null;
  }
}

function parseIntentMetadata(raw: string | undefined): ToolIntentAuditMetadataLike | null {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const metadata = parsed as ToolIntentAuditMetadataLike;
  return metadata.phase === 'intent' ? metadata : null;
}

function parseDecisionMetadata(raw: string | undefined): ToolDecisionAuditMetadataLike | null {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const metadata = parsed as ToolDecisionAuditMetadataLike;
  return metadata.phase === 'decision' ? metadata : null;
}

/**
 * 读取最近工具决策日志，供 UI 面板展示 | Read recent tool decision logs for UI surfaces
 */
export async function listRecentAiToolDecisionLogs(limit = 6): Promise<AiToolDecisionLogItem[]> {
  const rows = await appDb.audit_logs
    .where('[collection+field+timestamp]')
    .between(
      ['ai_messages', 'ai_tool_call_decision', ''],
      ['ai_messages', 'ai_tool_call_decision', '\uffff'],
    )
    .reverse()
    .limit(limit)
    .toArray();

  return rows.map((item) => mapAuditRowToAiToolDecisionLog(item));
}

/**
 * 按 requestId 组装工具调用回放快照 | Build a replay bundle for one tool requestId
 */
export async function loadAiToolReplayBundle(requestId: string): Promise<AiToolReplayBundle | null> {
  const rows = (await appDb.audit_logs
    .where('requestId')
    .equals(requestId)
    .toArray())
    .filter((row) => row.collection === 'ai_messages')
    .sort(compareIsoTimestampAsc);

  if (rows.length === 0) return null;

  const intentRow = rows
    .filter((row) => row.field === 'ai_tool_call_intent_assessment')
    .slice(-1)[0];
  const intentMetadata = parseIntentMetadata(intentRow?.metadataJson);
  const intentAssessment = safeParseJson(intentRow?.newValue);

  const decisions = rows
    .filter((row) => row.field === 'ai_tool_call_decision')
    .map((row) => {
      const metadata = parseDecisionMetadata(row.metadataJson);
      const base = mapAuditRowToAiToolDecisionLog(row);
      return {
        ...base,
        source: row.source,
        ...(typeof metadata?.executed === 'boolean' ? { executed: metadata.executed } : {}),
        ...(typeof metadata?.message === 'string' ? { message: metadata.message } : {}),
        ...(typeof metadata?.assistantMessageId === 'string' ? { assistantMessageId: metadata.assistantMessageId } : {}),
        ...(metadata?.toolCall ? { toolCall: metadata.toolCall } : {}),
        ...(metadata?.context ? { context: metadata.context } : {}),
      } satisfies AiToolReplayDecision;
    });

  const latestDecision = decisions[decisions.length - 1];
  const toolCall = latestDecision?.toolCall ?? intentMetadata?.toolCall;
  const toolName = latestDecision?.toolName ?? (typeof toolCall?.name === 'string' ? toolCall.name : '');
  const context = latestDecision?.context ?? intentMetadata?.context;
  const assistantMessageId = latestDecision?.assistantMessageId ?? intentMetadata?.assistantMessageId;
  const replayable = typeof toolCall?.name === 'string'
    && toolCall.name.trim().length > 0
    && !!toolCall.arguments
    && typeof toolCall.arguments === 'object';

  return {
    requestId,
    toolName,
    replayable,
    ...(toolCall ? { toolCall } : {}),
    ...(context ? { context } : {}),
    ...(assistantMessageId ? { assistantMessageId } : {}),
    ...(intentAssessment ? { intentAssessment } : {}),
    decisions,
    ...(latestDecision ? { latestDecision } : {}),
  };
}

/**
 * 构造离线 golden 对比快照 | Build a golden snapshot for offline comparison
 */
export function buildAiToolGoldenSnapshot(bundle: AiToolReplayBundle): AiToolGoldenSnapshot {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    requestId: bundle.requestId,
    toolName: bundle.toolName,
    replayable: bundle.replayable,
    ...(bundle.assistantMessageId ? { assistantMessageId: bundle.assistantMessageId } : {}),
    ...(bundle.toolCall ? { toolCall: bundle.toolCall } : {}),
    ...(bundle.context ? { context: bundle.context } : {}),
    ...(bundle.intentAssessment ? { intentAssessment: bundle.intentAssessment } : {}),
    decisions: bundle.decisions.map((item) => ({
      decision: item.decision,
      ...(item.reason ? { reason: item.reason } : {}),
      ...(typeof item.executed === 'boolean' ? { executed: item.executed } : {}),
      source: item.source,
      timestamp: item.timestamp,
      ...(item.message ? { message: item.message } : {}),
    })),
    ...(bundle.latestDecision ? {
      latestDecision: {
        decision: bundle.latestDecision.decision,
        ...(bundle.latestDecision.reason ? { reason: bundle.latestDecision.reason } : {}),
        ...(typeof bundle.latestDecision.executed === 'boolean' ? { executed: bundle.latestDecision.executed } : {}),
        source: bundle.latestDecision.source,
        timestamp: bundle.latestDecision.timestamp,
        ...(bundle.latestDecision.message ? { message: bundle.latestDecision.message } : {}),
      },
    } : {}),
  };
}

/**
 * 序列化离线 golden 对比快照 | Serialize golden snapshot for download/export
 */
export function serializeAiToolGoldenSnapshot(bundle: AiToolReplayBundle): string {
  return JSON.stringify(buildAiToolGoldenSnapshot(bundle), null, 2);
}

// ── Snapshot Diff ─────────────────────────────────────────────────────────────

/**
 * 单字段对比结果 | Single-field comparison result
 */
export interface AiToolSnapshotField {
  label: string;
  baseline: string;
  live: string;
  changed: boolean;
}

/**
 * 快照与当前回放的整体 diff 结果 | Structural diff between a baseline snapshot and a live replay bundle
 */
export interface AiToolSnapshotDiff {
  /** 所有字段均一致 | True when every compared field matches */
  matches: boolean;
  fields: AiToolSnapshotField[];
}

/**
 * 对比 golden 基准快照与当前 replay bundle | Diff a golden baseline snapshot against the live replay bundle
 *
 * 比较维度：toolName、replayable、latestDecision.*、decisions.length、toolCall.*
 * Compared dimensions: toolName, replayable, latestDecision.*, decisions.length, toolCall.*
 */
export function diffAiToolSnapshot(
  baseline: AiToolGoldenSnapshot,
  live: AiToolReplayBundle,
): AiToolSnapshotDiff {
  function field(label: string, b: unknown, l: unknown): AiToolSnapshotField {
    const bs = b === undefined ? '—' : JSON.stringify(b);
    const ls = l === undefined ? '—' : JSON.stringify(l);
    return { label, baseline: bs, live: ls, changed: bs !== ls };
  }

  const fields: AiToolSnapshotField[] = [
    field('toolName', baseline.toolName, live.toolName),
    field('replayable', baseline.replayable, live.replayable),
    field('latestDecision.decision', baseline.latestDecision?.decision, live.latestDecision?.decision),
    field('latestDecision.executed', baseline.latestDecision?.executed, live.latestDecision?.executed),
    field('latestDecision.reason', baseline.latestDecision?.reason, live.latestDecision?.reason),
    field('decisions.length', baseline.decisions.length, live.decisions.length),
    field('toolCall.name', baseline.toolCall?.name, live.toolCall?.name),
    field('toolCall.arguments', baseline.toolCall?.arguments, live.toolCall?.arguments),
  ];

  return { matches: fields.every((f) => !f.changed), fields };
}