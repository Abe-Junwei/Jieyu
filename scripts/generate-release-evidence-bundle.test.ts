import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface PerfSection {
  status: string;
  perfJsonReportReadError?: {
    message: string;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  cards: Array<{
    id: string;
    script: string;
    status: string;
    thresholdMaxMs: number | null;
    metricObservedMs: number | null;
    checks?: Array<{
      label: string;
      maxMs: number;
      observedMs: number | null;
      passed: boolean | null;
    }>;
  }>;
}

interface CostGuardSection {
  status: string;
  estimatorVersion: string;
  summary: {
    requestCount: number;
    budgetTriggerCount: number;
    retryTriggeredCount: number;
    retrySuccessCount: number;
    outputCapTriggeredCount: number;
  };
  trend: {
    bucket: string;
    pointCount: number;
    compareReady: boolean;
    points: Array<{
      date: string;
      requestCount: number;
      budgetTriggerCount: number;
      retryTriggeredCount: number;
      retrySuccessCount: number;
      outputCapTriggeredCount: number;
    }>;
  };
}

interface ReleaseEvidenceReport {
  degraded?: boolean;
  metadata?: Record<string, unknown>;
  summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  steps?: Array<{ id: string; status: string }>;
  perf: PerfSection;
  progressiveDisclosure: {
    status: string;
    cards: Array<{
      id: string;
      value: number;
      numerator: number;
      denominator: number;
      sampleRequestIds?: string[];
    }>;
  };
  memoryRecallShape: {
    status: string;
    card: {
      id: string;
      status: string;
      sampleCount: number;
      candidateCountAvg: number;
      emptySelectionRate: number;
      duplicateSuppressionRate: number;
      budgetSuppressionRate: number;
      freshnessDistribution: Record<string, number>;
      sampleRequestIds?: string[];
    } | null;
  };
  backgroundMemoryExtraction: {
    status: string;
    summary: {
      total: number;
      scheduled: number;
      merged: number;
      completed: number;
      skipped: number;
      failed: number;
      writtenCount: number;
      avgDurationMs?: number;
    };
    skipReasons: Record<string, number>;
    sampleTaskIds?: string[];
  };
  coordinationLite: {
    status: string;
    summary: {
      total: number;
      completed: number;
      failed: number;
      cancelled: number;
      quarantinedCount: number;
      avgDurationMs?: number;
    };
    phaseDistribution: Record<string, number>;
    parallelPolicy: Record<string, number>;
    sampleTaskIds?: string[];
  };
  userDirectiveGovernance: {
    status: string;
    summary: {
      total: number;
      extractionCount: number;
      applicationCount: number;
      responsePolicyResolutionCount: number;
      accepted: number;
      ignored: number;
      downgraded: number;
      superseded: number;
      languageFormatterMismatchCount: number;
    };
    categories: Record<string, number>;
    reasonCodes?: Record<string, number>;
    reasonLabelsEn?: Record<string, number>;
    reasonLabelsZh?: Record<string, number>;
    sampleRequestIds?: string[];
  };
  actionApprovalCenter?: {
    status: string;
    summary: {
      total: number;
      pending: number;
      blocked: number;
      confirmed: number;
      cancelled: number;
      failed: number;
      partialFailureCount?: number;
    };
    riskTiers: Record<string, number>;
    approvalModes: Record<string, number>;
    sampleRequestIds?: string[];
  };
  durableOrchestration?: {
    status: string;
    summary: {
      total: number;
      done: number;
      failed: number;
      cancelledByUser: number;
      running: number;
      pending: number;
      checkpointed: number;
      resumable: number;
      handoffRequired: number;
      checkpointRecovered: number;
      longTaskCompletionRate: number;
      humanInterventionRate: number;
      checkpointRecoveryRate: number;
      avgDurationMs: number;
    };
    taskTypes: Record<string, number>;
    handoffReasons: Record<string, number>;
  };
  auditFieldDictionary?: {
    schemaVersion: number;
    status: string;
    namespace: string;
    fields: Array<{ field: string; phase: string; requiredMetadataKeys: string[] }>;
  };
  costGuard: CostGuardSection;
  evidenceIndex: Array<{ conclusionId: string; evidenceType?: string; exitCode?: number | null }>;
  aiToolEvidenceCards: {
    summary: {
      total: number;
      ready: number;
      skipped: number;
    };
    auditReadError?: {
      message: string;
    };
    cards: Array<{
      requestId: string;
      status: string;
      latestDecision: {
        decision: string;
        reason?: string;
        reasonLabelEn?: string;
        reasonLabelZh?: string;
        timestamp?: string;
      };
    }>;
  };
  extensions: {
    status: string;
    capabilityAuditSummary: Array<{
      extensionId: string;
      total: number;
      success: number;
      failed: number;
      successRate: number;
    }>;
  };
}

function runReleaseEvidenceScript(args: string[]) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'generate-release-evidence-bundle.mjs');
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('generate-release-evidence-bundle script', () => {
  it('emits perf and cost guard sections for full dry-run profile', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const auditExportPath = path.join(
      process.cwd(),
      'docs',
      'execution',
      'audits',
      'ai-tool-decision-audit-export-v1.ndjson',
    );

    try {
      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        '--ai-request-ids=toolreq_diff_1',
        `--ai-audit-export=${auditExportPath}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;

      expect(report.perf.summary.total).toBe(3);
      expect(report.perf.cards).toHaveLength(3);
      expect(report.perf.cards.map((card) => card.script)).toEqual([
        'perf:track',
        'test:timeline-cqrs-phase9',
        'perf:ai',
      ]);
      expect(report.perf.cards[0]?.thresholdMaxMs).toBe(260);
      expect(report.perf.cards[1]?.thresholdMaxMs).toBe(500);
      expect(report.perf.cards[2]?.thresholdMaxMs).toBeNull();
      expect(report.perf.cards[0]?.metricObservedMs).toBeNull();

      expect(report.costGuard.estimatorVersion).toBe('v1.provider_usage_or_unknown');
      expect(report.costGuard.summary.requestCount).toBe(1);
      expect(report.costGuard.summary.budgetTriggerCount).toBe(0);
      expect(report.costGuard.summary.retryTriggeredCount).toBe(0);
      expect(report.costGuard.summary.retrySuccessCount).toBe(0);
      expect(report.costGuard.summary.outputCapTriggeredCount).toBe(0);

      expect(report.evidenceIndex.some((item) => item.conclusionId === 'a3.perf.cards')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'm0.audit-field-dictionary.v1')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'p1.progressive-disclosure.v1')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'p1.rag-shape-telemetry.v1')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'p1.cost-guard.v1')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'p1.cost-guard.trend.v1')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'b3.extensions.capability-audit-summary')).toBe(true);
      expect(report.extensions.status).toBe('skipped');
      expect(report.progressiveDisclosure.status).toBe('ready_or_partial');
      expect(report.progressiveDisclosure.cards).toHaveLength(4);
      expect(report.memoryRecallShape.status).toBe('skipped');
      expect(report.costGuard.trend.bucket).toBe('day');
      expect(report.costGuard.trend.pointCount).toBe(1);
      expect(report.auditFieldDictionary?.schemaVersion).toBe(1);
      expect(report.auditFieldDictionary?.status).toBe('ready');
      expect(report.auditFieldDictionary?.fields.map((item) => item.field)).toEqual([
        'ai_user_directive_extraction',
        'ai_user_directive_application',
        'ai_response_policy_resolution',
        'ai_tool_call_decision',
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('counts runtime cost guard reasons from audit export rows', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const auditExportPath = path.join(tempDir, 'ai-tool-decision-audit.ndjson');
    const auditRows = [
      {
        request_id: 'toolreq_budget_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:00.000Z',
        new_value: 'blocked:cost_guard:session_budget_exceeded',
      },
      {
        request_id: 'toolreq_retry_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:01.000Z',
        new_value: 'capped:cost_guard:output_token_cap_exceeded',
      },
      {
        request_id: 'toolreq_retry_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:02.000Z',
        new_value: 'retry:cost_guard:retry_after_output_cap',
      },
      {
        request_id: 'toolreq_retry_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:03.000Z',
        new_value: 'confirmed:cost_guard:retry_budget_upgrade',
      },
    ];

    try {
      writeFileSync(
        auditExportPath,
        `${auditRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );

      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--ai-audit-export=${auditExportPath}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;

      expect(report.costGuard.estimatorVersion).toBe('v1.provider_usage_or_unknown');
      expect(report.costGuard.summary.requestCount).toBe(2);
      expect(report.costGuard.summary.budgetTriggerCount).toBe(1);
      expect(report.costGuard.summary.retryTriggeredCount).toBe(1);
      expect(report.costGuard.summary.retrySuccessCount).toBe(1);
      expect(report.costGuard.summary.outputCapTriggeredCount).toBe(1);
      expect(report.costGuard.trend.pointCount).toBe(1);
      expect(report.costGuard.trend.compareReady).toBe(false);

      expect(report.evidenceIndex.some((item) => item.conclusionId === 'p1.cost-guard.v1')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'p1.cost-guard.trend.v1')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds durable orchestration metrics from ai_task_snapshots export rows', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const snapshotsPath = path.join(tempDir, 'ai-task-snapshots.json');

    try {
      writeFileSync(snapshotsPath, JSON.stringify({
        ai_task_snapshots: [
          {
            taskId: 'task-agent-loop-done',
            taskType: 'agent_loop',
            status: 'done',
            hasCheckpoint: true,
            resumable: false,
            handoffReason: 'token_budget_warning',
            durationMs: 1200,
            updatedAt: '2026-04-27T10:00:00.000Z',
          },
          {
            taskId: 'task-agent-loop-pending',
            taskType: 'agent_loop',
            status: 'pending',
            hasCheckpoint: true,
            resumable: true,
            handoffReason: 'token_budget_warning',
            durationMs: 800,
            updatedAt: '2026-04-27T10:01:00.000Z',
          },
          {
            taskId: 'task-embed-failed',
            taskType: 'embed',
            status: 'failed',
            hasCheckpoint: false,
            errorMessage: 'cancelled_by_user',
            durationMs: 400,
            updatedAt: '2026-04-27T10:02:00.000Z',
          },
        ],
      }), 'utf8');

      const result = runReleaseEvidenceScript([
        '--profile=lite',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--ai-task-snapshots=${snapshotsPath}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;

      expect(report.durableOrchestration?.status).toBe('ready_or_partial');
      expect(report.durableOrchestration?.summary.total).toBe(3);
      expect(report.durableOrchestration?.summary.done).toBe(1);
      expect(report.durableOrchestration?.summary.failed).toBe(1);
      expect(report.durableOrchestration?.summary.cancelledByUser).toBe(1);
      expect(report.durableOrchestration?.summary.pending).toBe(1);
      expect(report.durableOrchestration?.summary.checkpointed).toBe(2);
      expect(report.durableOrchestration?.summary.resumable).toBe(1);
      expect(report.durableOrchestration?.summary.handoffRequired).toBe(2);
      expect(report.durableOrchestration?.summary.checkpointRecovered).toBe(1);
      expect(report.durableOrchestration?.summary.longTaskCompletionRate).toBe(0.3333);
      expect(report.durableOrchestration?.summary.humanInterventionRate).toBe(0.6667);
      expect(report.durableOrchestration?.summary.checkpointRecoveryRate).toBe(0.5);
      expect(report.durableOrchestration?.summary.avgDurationMs).toBe(800);
      expect(report.durableOrchestration?.taskTypes).toEqual({ agent_loop: 2, embed: 1 });
      expect(report.durableOrchestration?.handoffReasons).toEqual({ token_budget_warning: 2 });
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'f3.durable-orchestration.v1')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds cost guard daily trend points for multi-day comparison', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const auditExportPath = path.join(tempDir, 'ai-tool-decision-audit.ndjson');
    const auditRows = [
      {
        request_id: 'toolreq_cost_trend_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-24T10:00:00.000Z',
        new_value: 'blocked:cost_guard:session_budget_exceeded',
      },
      {
        request_id: 'toolreq_cost_trend_002',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:00.000Z',
        new_value: 'retry:cost_guard:retry_after_output_cap',
      },
      {
        request_id: 'toolreq_cost_trend_002',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:01.000Z',
        new_value: 'confirmed:cost_guard:retry_budget_upgrade',
      },
    ];

    try {
      writeFileSync(
        auditExportPath,
        `${auditRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );

      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--ai-audit-export=${auditExportPath}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;

      expect(report.costGuard.trend.bucket).toBe('day');
      expect(report.costGuard.trend.pointCount).toBe(2);
      expect(report.costGuard.trend.compareReady).toBe(true);
      expect(report.costGuard.trend.points).toEqual([
        {
          date: '2026-04-24',
          requestCount: 1,
          budgetTriggerCount: 1,
          retryTriggeredCount: 0,
          retrySuccessCount: 0,
          outputCapTriggeredCount: 0,
        },
        {
          date: '2026-04-25',
          requestCount: 1,
          budgetTriggerCount: 0,
          retryTriggeredCount: 1,
          retrySuccessCount: 1,
          outputCapTriggeredCount: 0,
        },
      ]);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'p1.cost-guard.trend.v1')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds progressive disclosure cards from decision-chain audit rows', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const auditExportPath = path.join(tempDir, 'ai-tool-decision-audit.ndjson');
    const auditRows = [
      {
        request_id: 'toolreq_progressive_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:00.000Z',
        new_value: 'confirmed:set_transcription_text',
      },
      {
        request_id: 'toolreq_progressive_002',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:01.000Z',
        new_value: 'clarify:set_transcription_text:missing_unit_target',
      },
      {
        request_id: 'toolreq_progressive_002',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:02.000Z',
        new_value: 'confirmed:set_transcription_text',
      },
      {
        request_id: 'toolreq_progressive_003',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:03.000Z',
        new_value: 'clarify:set_transcription_text:missing_unit_target',
      },
      {
        request_id: 'toolreq_progressive_003',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:04.000Z',
        new_value: 'clarify:set_transcription_text:missing_unit_target',
      },
      {
        request_id: 'toolreq_progressive_003',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:05.000Z',
        new_value: 'blocked:set_transcription_text:unresolved_write_target',
      },
      {
        request_id: 'toolreq_progressive_004',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:06.000Z',
        new_value: 'retry:cost_guard:retry_after_output_cap',
      },
      {
        request_id: 'toolreq_progressive_004',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:07.000Z',
        new_value: 'confirmed:set_transcription_text',
      },
    ];

    try {
      writeFileSync(
        auditExportPath,
        `${auditRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );

      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--ai-audit-export=${auditExportPath}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;
      expect(report.progressiveDisclosure.status).toBe('ready_or_partial');

      const firstPass = report.progressiveDisclosure.cards.find((card) => card.id === 'first_pass_resolution_rate');
      const clarifyThenSuccess = report.progressiveDisclosure.cards.find((card) => card.id === 'clarify_then_success_rate');
      const advancedEntryReach = report.progressiveDisclosure.cards.find((card) => card.id === 'advanced_entry_reach_rate');
      const clarifyLoop = report.progressiveDisclosure.cards.find((card) => card.id === 'clarify_loop_rate');

      expect(firstPass?.numerator).toBe(2);
      expect(firstPass?.denominator).toBe(4);
      expect(firstPass?.value).toBe(0.5);
      expect(firstPass?.sampleRequestIds).toContain('toolreq_progressive_001');
      expect(firstPass?.sampleRequestIds).toContain('toolreq_progressive_004');

      expect(clarifyThenSuccess?.numerator).toBe(1);
      expect(clarifyThenSuccess?.denominator).toBe(4);
      expect(clarifyThenSuccess?.value).toBe(0.25);
      expect(clarifyThenSuccess?.sampleRequestIds).toContain('toolreq_progressive_002');

      expect(advancedEntryReach?.numerator).toBe(1);
      expect(advancedEntryReach?.denominator).toBe(4);
      expect(advancedEntryReach?.value).toBe(0.25);
      expect(advancedEntryReach?.sampleRequestIds).toContain('toolreq_progressive_004');

      expect(clarifyLoop?.numerator).toBe(1);
      expect(clarifyLoop?.denominator).toBe(4);
      expect(clarifyLoop?.value).toBe(0.25);
      expect(clarifyLoop?.sampleRequestIds).toContain('toolreq_progressive_003');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('prefers parseable timestamps when resolving latest cost-guard decision', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const auditExportPath = path.join(tempDir, 'ai-tool-decision-audit.ndjson');
    const auditRows = [
      {
        request_id: 'toolreq_retry_parseable_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: 'not-a-time',
        new_value: 'retry:cost_guard:retry_after_output_cap',
      },
      {
        request_id: 'toolreq_retry_parseable_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:03.000Z',
        new_value: 'confirmed:cost_guard:retry_budget_upgrade',
      },
    ];

    try {
      writeFileSync(
        auditExportPath,
        `${auditRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );

      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--ai-audit-export=${auditExportPath}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;
      expect(report.costGuard.summary.retryTriggeredCount).toBe(1);
      expect(report.costGuard.summary.retrySuccessCount).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('prefers parseable timestamps when resolving latest ai evidence card decision', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const auditExportPath = path.join(tempDir, 'ai-tool-decision-audit.ndjson');
    const requestId = 'toolreq_ai_card_latest_001';
    const auditRows = [
      {
        request_id: requestId,
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: 'not-a-time',
        new_value: 'blocked:set_transcription_text:unresolved_write_target',
      },
      {
        request_id: requestId,
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:03.000Z',
        new_value: 'confirmed:set_transcription_text',
        metadata_json: JSON.stringify({
          toolCall: {
            name: 'set_transcription_text',
            arguments: { segmentId: 'seg-1', text: 'hello world' },
          },
        }),
      },
    ];

    try {
      writeFileSync(
        auditExportPath,
        `${auditRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );

      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--ai-audit-export=${auditExportPath}`,
        `--ai-request-ids=${requestId}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;
      const card = report.aiToolEvidenceCards.cards.find((item) => item.requestId === requestId);
      expect(card).toBeDefined();
      expect(card?.status).toBe('ready');
      expect(card?.latestDecision.decision).toBe('confirmed');
      expect(card?.latestDecision.reason).toBeUndefined();
      expect(card?.latestDecision.timestamp).toBe('2026-04-25T10:00:03.000Z');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('hydrates reason labels for ai evidence card latest decision', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const auditExportPath = path.join(tempDir, 'ai-tool-decision-audit.ndjson');
    const requestId = 'toolreq_ai_card_reason_label_001';
    const auditRows = [
      {
        request_id: requestId,
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:03.000Z',
        new_value: 'policy_blocked:delete_layer:user_directive_deny_destructive',
      },
    ];

    try {
      writeFileSync(
        auditExportPath,
        `${auditRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );

      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--ai-audit-export=${auditExportPath}`,
        `--ai-request-ids=${requestId}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;
      const card = report.aiToolEvidenceCards.cards.find((item) => item.requestId === requestId);
      expect(card).toBeDefined();
      expect(card?.latestDecision.reason).toBe('user_directive_deny_destructive');
      expect(card?.latestDecision.reasonLabelEn).toBe('Blocked by user safety preference for destructive actions.');
      expect(card?.latestDecision.reasonLabelZh).toBe('已被用户安全偏好阻断高风险破坏性操作');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds extension capability audit summary grouped by extension id', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const extensionAuditPath = path.join(tempDir, 'extension-capability-audit.ndjson');
    const extensionRows = [
      { extensionId: 'ext.alpha', capability: 'host_transcription_layer_linking', ok: true, durationMs: 12 },
      { extensionId: 'ext.alpha', capability: 'host_transcription_layer_linking', ok: false, durationMs: 15, errorMessage: 'denied' },
      { extensionId: 'ext.beta', capability: 'host_transcription_layer_linking', ok: true, durationMs: 9 },
    ];

    try {
      writeFileSync(
        extensionAuditPath,
        `${extensionRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );

      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--extension-capability-audit-export=${extensionAuditPath}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;
      expect(report.extensions.status).toBe('ready_or_partial');
      expect(report.extensions.capabilityAuditSummary).toEqual([
        {
          extensionId: 'ext.alpha',
          total: 2,
          success: 1,
          failed: 1,
          successRate: 0.5,
        },
        {
          extensionId: 'ext.beta',
          total: 1,
          success: 1,
          failed: 0,
          successRate: 1,
        },
      ]);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'b3.extensions.capability-audit-summary')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('hydrates perf observed metrics from perf JSON report input', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const perfJsonPath = path.join(tempDir, 'perf-report.json');
    const perfJson = {
      cards: [
        { script: 'perf:track', label: '2k', observedMs: 88 },
        { script: 'perf:track', label: '5k', observedMs: 201 },
        { script: 'test:timeline-cqrs-phase9', label: '1k', observedMs: 53 },
        { script: 'test:timeline-cqrs-phase9', label: '5k', observedMs: 163 },
        { script: 'test:timeline-cqrs-phase9', label: '10k', observedMs: 320 },
        { script: 'perf:ai', label: 'embedding', observedMs: 412 },
      ],
    };

    try {
      writeFileSync(perfJsonPath, `${JSON.stringify(perfJson, null, 2)}\n`, 'utf8');

      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--perf-json-report=${perfJsonPath}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;
      expect(report.perf.status).toBe('ready_or_partial');
      expect(report.perf.cards.find((card) => card.script === 'perf:track')?.metricObservedMs).toBe(201);
      expect(report.perf.cards.find((card) => card.script === 'test:timeline-cqrs-phase9')?.metricObservedMs).toBe(320);
      expect(report.perf.cards.find((card) => card.script === 'perf:ai')?.metricObservedMs).toBe(412);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails enforce mode when requested AI evidence cards cannot be built', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const missingAuditExportPath = path.join(tempDir, 'missing-ai-audit.ndjson');

    try {
      const result = runReleaseEvidenceScript([
        '--profile=core',
        '--dry-run',
        '--mode=enforce',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        '--ai-request-ids=missing_request',
        `--ai-audit-export=${missingAuditExportPath}`,
      ]);

      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;

      expect(report.degraded).toBe(true);
      expect(report.aiToolEvidenceCards.summary.ready).toBe(0);
      expect(report.aiToolEvidenceCards.auditReadError?.message).toContain('missing-ai-audit.ndjson');
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'a2.ai-evidence-card.require-ready')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'release-evidence.input-read.require-success')).toBe(true);
      expect(report.summary?.failed).toBeGreaterThanOrEqual(2);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails enforce mode when an explicit perf JSON report cannot be read', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const missingPerfJsonPath = path.join(tempDir, 'missing-perf.json');

    try {
      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=enforce',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--perf-json-report=${missingPerfJsonPath}`,
      ]);

      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;

      expect(report.degraded).toBe(true);
      expect(report.perf.perfJsonReportReadError?.message).toContain('missing-perf.json');
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'release-evidence.input-read.require-success')).toBe(true);
      expect(report.summary?.failed).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('marks B3 extension evidence index failed when explicit extension audit export cannot be read', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const missingExtensionAuditPath = path.join(tempDir, 'missing-extension-audit.ndjson');

    try {
      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=enforce',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--extension-capability-audit-export=${missingExtensionAuditPath}`,
      ]);

      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;
      const b3 = report.evidenceIndex.find((item) => item.conclusionId === 'b3.extensions.capability-audit-summary');

      expect(report.degraded).toBe(true);
      expect(b3).toMatchObject({
        evidenceType: 'extension_capability_audit_input_failed',
        exitCode: 1,
      });
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'release-evidence.input-read.require-success')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('includes release-evidence section skips in the root summary', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');

    try {
      const result = runReleaseEvidenceScript([
        '--profile=core',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;

      expect(report.summary?.total).toBe(report.evidenceIndex.length);
      expect(report.summary?.skipped).toBeGreaterThan(5);
      expect(report.evidenceIndex.some((item) => item.evidenceType === 'progressive_disclosure_skipped')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds memory recall shape telemetry card from audit metadata', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const auditExportPath = path.join(tempDir, 'ai-tool-decision-audit.ndjson');
    const auditRows = [
      {
        request_id: 'toolreq_ragshape_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:00.000Z',
        new_value: 'confirmed:set_transcription_text',
        metadata_json: JSON.stringify({
          ragShape: {
            candidateCount: 10,
            selectedCount: 0,
            duplicateSuppressedCount: 2,
            budgetSuppressedCount: 1,
            freshnessBucket: 'lt_1d',
          },
        }),
      },
      {
        request_id: 'toolreq_ragshape_002',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:01.000Z',
        new_value: 'confirmed:set_transcription_text',
        metadata_json: JSON.stringify({
          memoryRecallShape: {
            candidateCount: 20,
            selectedCount: 5,
            duplicateSuppressedCount: 0,
            budgetSuppressedCount: 0,
            freshnessBucket: '1_7d',
          },
        }),
      },
    ];

    try {
      writeFileSync(
        auditExportPath,
        `${auditRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );

      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--ai-audit-export=${auditExportPath}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;

      expect(report.memoryRecallShape.status).toBe('ready_or_partial');
      expect(report.memoryRecallShape.card?.sampleCount).toBe(2);
      expect(report.memoryRecallShape.card?.candidateCountAvg).toBe(15);
      expect(report.memoryRecallShape.card?.emptySelectionRate).toBe(0.5);
      expect(report.memoryRecallShape.card?.duplicateSuppressionRate).toBe(0.5);
      expect(report.memoryRecallShape.card?.budgetSuppressionRate).toBe(0.5);
      expect(report.memoryRecallShape.card?.freshnessDistribution).toEqual({
        '1_7d': 1,
        lt_1d: 1,
      });
      expect(report.memoryRecallShape.card?.sampleRequestIds).toEqual([
        'toolreq_ragshape_001',
        'toolreq_ragshape_002',
      ]);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'p1.rag-shape-telemetry.v1')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds C5 and C7 cards from AI audit metadata', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const auditExportPath = path.join(tempDir, 'ai-c-stage-audit.ndjson');
    const auditRows = [
      {
        request_id: 'bgmem_001',
        collection: 'ai_messages',
        field: 'ai_background_memory_extraction',
        timestamp: '2026-04-25T10:00:00.000Z',
        new_value: 'scheduled',
        metadata_json: JSON.stringify({
          phase: 'background_memory_extraction',
          taskId: 'bgmem_001',
          status: 'scheduled',
          writtenCount: 0,
          durationMs: 0,
        }),
      },
      {
        request_id: 'bgmem_001',
        collection: 'ai_messages',
        field: 'ai_background_memory_extraction',
        timestamp: '2026-04-25T10:00:01.000Z',
        new_value: 'completed',
        metadata_json: JSON.stringify({
          phase: 'background_memory_extraction',
          taskId: 'bgmem_001',
          status: 'completed',
          writtenCount: 2,
          durationMs: 12,
        }),
      },
      {
        request_id: 'bgmem_002',
        collection: 'ai_messages',
        field: 'ai_background_memory_extraction',
        timestamp: '2026-04-25T10:00:02.000Z',
        new_value: 'skipped',
        metadata_json: JSON.stringify({
          phase: 'background_memory_extraction',
          taskId: 'bgmem_002',
          status: 'skipped',
          skippedReason: 'empty-extraction',
          writtenCount: 0,
          durationMs: 8,
        }),
      },
      {
        request_id: 'directive_extract_001',
        collection: 'ai_messages',
        field: 'ai_user_directive_extraction',
        timestamp: '2026-04-25T10:00:02.500Z',
        new_value: 'extracted:2',
        metadata_json: JSON.stringify({
          phase: 'user_directive_extraction',
          summary: {
            extractedCount: 2,
            acceptedCount: 2,
            ignoredCount: 0,
            downgradedCount: 0,
            supersededCount: 0,
            categories: { response: 1, safety: 1 },
          },
        }),
      },
      {
        request_id: 'directive_apply_001',
        collection: 'ai_messages',
        field: 'ai_user_directive_application',
        timestamp: '2026-04-25T10:00:02.600Z',
        new_value: 'accepted:2;ignored:0;downgraded:0;superseded:0',
        metadata_json: JSON.stringify({
          phase: 'user_directive_application',
          summary: {
            extractedCount: 2,
            acceptedCount: 2,
            ignoredCount: 0,
            downgradedCount: 0,
            supersededCount: 0,
            categories: { response: 1, safety: 1 },
          },
          reason: 'user_directive_confirmation_required',
        }),
      },
      {
        request_id: 'response_policy_001',
        collection: 'ai_messages',
        field: 'ai_response_policy_resolution',
        timestamp: '2026-04-25T10:00:02.700Z',
        new_value: 'en-US',
        metadata_json: JSON.stringify({
          phase: 'response_policy_resolution',
          policy: { language: 'en', locale: 'en-US', style: 'verbose', format: 'invalid_format' },
        }),
      },
      {
        request_id: 'ast-1_loop_1',
        collection: 'ai_messages',
        field: 'ai_coordination_lite',
        timestamp: '2026-04-25T10:00:03.000Z',
        new_value: 'completed',
        metadata_json: JSON.stringify({
          phase: 'coordination_lite',
          taskSessionId: 'task-1',
          notification: {
            taskId: 'ast-1_loop_1',
            status: 'completed',
            summary: 'searched project state',
            phase: 'research',
            usage: { durationMs: 30, inputTokens: 10, outputTokens: 5 },
          },
          parallelPolicy: { canRunInParallel: true, reason: 'readonly-parallel' },
          quarantinedCount: 0,
        }),
      },
      {
        request_id: 'ast-1_loop_2',
        collection: 'ai_messages',
        field: 'ai_coordination_lite',
        timestamp: '2026-04-25T10:00:04.000Z',
        new_value: 'failed',
        metadata_json: JSON.stringify({
          phase: 'coordination_lite',
          taskSessionId: 'task-1',
          notification: {
            taskId: 'ast-1_loop_2',
            status: 'failed',
            summary: 'verification failed',
            phase: 'verification',
            usage: { durationMs: 50 },
          },
          parallelPolicy: { canRunInParallel: true, reason: 'verification-parallel' },
          quarantinedCount: 1,
        }),
      },
      {
        request_id: 'approval_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:04.500Z',
        new_value: 'policy_pending:delete_layer:user_directive_confirmation_required',
        metadata_json: JSON.stringify({
          phase: 'decision',
          outcome: 'policy_pending',
          approvalMode: 'user_preference',
          riskTier: 'high',
        }),
      },
      {
        request_id: 'approval_002',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:05.000Z',
        new_value: 'policy_blocked:delete_layer:user_directive_deny_destructive',
        metadata_json: JSON.stringify({
          phase: 'decision',
          outcome: 'policy_blocked',
          approvalMode: 'safety_gate',
          riskTier: 'high',
        }),
      },
      {
        request_id: 'approval_003',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:05.500Z',
        new_value: 'confirmed:set_transcription_text',
        metadata_json: JSON.stringify({
          phase: 'decision',
          outcome: 'confirmed',
          approvalMode: 'propose_changes',
          riskTier: 'medium',
        }),
      },
      {
        request_id: 'approval_004',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:06.000Z',
        new_value: 'confirm_failed:propose_changes:child_failed',
        metadata_json: JSON.stringify({
          phase: 'decision',
          outcome: 'confirm_failed',
          approvalMode: 'propose_changes',
          riskTier: 'high',
          executionProgress: {
            appliedCount: 1,
            totalCount: 2,
            partial: true,
          },
        }),
      },
    ];

    try {
      writeFileSync(
        auditExportPath,
        `${auditRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );

      const result = runReleaseEvidenceScript([
        '--profile=full',
        '--dry-run',
        '--mode=shadow',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--ai-audit-export=${auditExportPath}`,
      ]);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;

      expect(report.backgroundMemoryExtraction.status).toBe('ready_or_partial');
      expect(report.backgroundMemoryExtraction.summary).toMatchObject({
        total: 3,
        scheduled: 1,
        completed: 1,
        skipped: 1,
        writtenCount: 2,
      });
      expect(report.backgroundMemoryExtraction.skipReasons).toEqual({ 'empty-extraction': 1 });
      expect(report.backgroundMemoryExtraction.sampleTaskIds).toEqual(['bgmem_001', 'bgmem_002']);

      expect(report.coordinationLite.status).toBe('ready_or_partial');
      expect(report.coordinationLite.summary).toMatchObject({
        total: 2,
        completed: 1,
        failed: 1,
        quarantinedCount: 1,
      });
      expect(report.coordinationLite.phaseDistribution).toEqual({
        research: 1,
        verification: 1,
      });
      expect(report.coordinationLite.parallelPolicy).toEqual({
        'readonly-parallel': 1,
        'verification-parallel': 1,
      });
      expect(report.userDirectiveGovernance.status).toBe('ready_or_partial');
      expect(report.userDirectiveGovernance.summary).toMatchObject({
        total: 3,
        extractionCount: 1,
        applicationCount: 1,
        responsePolicyResolutionCount: 1,
        accepted: 4,
        languageFormatterMismatchCount: 1,
      });
      expect(report.userDirectiveGovernance.categories).toEqual({ response: 2, safety: 2 });
      expect(report.userDirectiveGovernance.reasonCodes).toEqual({
        user_directive_confirmation_required: 1,
      });
      expect(report.userDirectiveGovernance.reasonLabelsEn).toEqual({
        'User preference requires confirmation before execution.': 1,
      });
      expect(report.userDirectiveGovernance.reasonLabelsZh).toEqual({
        用户偏好要求先确认再执行: 1,
      });
      expect(report.actionApprovalCenter?.status).toBe('ready_or_partial');
      expect(report.actionApprovalCenter?.summary).toMatchObject({
        total: 4,
        pending: 1,
        blocked: 1,
        confirmed: 1,
        failed: 1,
        partialFailureCount: 1,
      });
      expect(report.actionApprovalCenter?.riskTiers).toEqual({
        high: 3,
        medium: 1,
      });
      expect(report.actionApprovalCenter?.approvalModes).toEqual({
        propose_changes: 2,
        safety_gate: 1,
        user_preference: 1,
      });
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'c5.background-memory-extraction.v1')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'c7.coordination-lite.v1')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'c8.user-directive-governance.v1')).toBe(true);
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'm1.action-approval-center.v1')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails enforce mode when cost guard trend ready requirement is enabled but compareReady is false', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-evidence-bundle-'));
    const outputPath = path.join(tempDir, 'release-evidence.json');
    const logsDir = path.join(tempDir, 'logs');
    const auditExportPath = path.join(tempDir, 'ai-tool-decision-audit.ndjson');
    const auditRows = [
      {
        request_id: 'toolreq_cost_require_001',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        timestamp: '2026-04-25T10:00:00.000Z',
        new_value: 'blocked:cost_guard:session_budget_exceeded',
      },
    ];

    try {
      writeFileSync(
        auditExportPath,
        `${auditRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        'utf8',
      );

      const result = runReleaseEvidenceScript([
        '--profile=core',
        '--mode=enforce',
        '--require-cost-guard-trend-ready',
        '--dry-run',
        `--output=${outputPath}`,
        `--logs-dir=${logsDir}`,
        `--ai-audit-export=${auditExportPath}`,
      ]);

      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as ReleaseEvidenceReport;

      expect(report.degraded).toBe(true);
      expect(report.costGuard.trend.compareReady).toBe(false);
      expect(report.metadata?.costGuardTrendRequirement).toBe('compareReady');
      expect(report.evidenceIndex.some((item) => item.conclusionId === 'p1.cost-guard.trend.require-ready')).toBe(true);
      expect(report.steps?.some((item) => item.id === 'p1.cost-guard-trend.require-ready' && item.status === 'failed')).toBe(true);
      expect((report.summary?.failed ?? 0) >= 1).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
