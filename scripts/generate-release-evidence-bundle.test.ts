import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface PerfSection {
  status: string;
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
  costGuard: CostGuardSection;
  evidenceIndex: Array<{ conclusionId: string }>;
  aiToolEvidenceCards: {
    cards: Array<{
      requestId: string;
      status: string;
      latestDecision: {
        decision: string;
        reason?: string;
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
});
