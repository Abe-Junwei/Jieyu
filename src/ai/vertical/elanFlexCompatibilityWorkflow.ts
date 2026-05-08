/**
 * ELAN / FLEx Compatibility Workflow
 *
 * 职责：
 * - 定义 compatibility_report schema（finding + report）
 * - 构建 LLM system prompt，指导模型检查 ELAN/FLEx 互通问题
 * - 解析 LLM 输出为结构化 report
 * - reflection：验证 report 结构完整性、finding 可证据化
 *
 * P5 首版覆盖 5 类 finding：
 * 1. tier_mapping — EAF tier 与解语层映射不一致
 * 2. lexeme_conflict — FLEx 词条与现有 lexeme 冲突
 * 3. time_gap — 时间码缺口或重叠
 * 4. gloss_pos_mismatch — gloss / POS 标注不一致
 * 5. controlled_vocabulary_mismatch — 受控词表（POS/tag）不一致
 */

import { buildEvidencePacketV0, type EvidencePacketV0 } from './evidencePacket';

type CompatibilityFindingKind =
  | 'tier_mapping'
  | 'lexeme_conflict'
  | 'time_gap'
  | 'gloss_pos_mismatch'
  | 'controlled_vocabulary_mismatch';

type CompatibilityFindingSeverity = 'info' | 'warning' | 'error';

interface CompatibilityFinding {
  findingId: string;
  kind: CompatibilityFindingKind;
  severity: CompatibilityFindingSeverity;
  title: string;
  description: string;
  evidencePackets: EvidencePacketV0[];
  recommendedAction: string;
  adoptionCandidateId?: string;
}

export interface CompatibilityReport {
  reportId: string;
  sourceSetId?: string;
  findings: CompatibilityFinding[];
  summary: string;
  exportTargets: string[];
  generatedAt: string;
  workflowVersion: string;
}

export interface ElanFlexCompatibilityReflectionResult {
  reflectionFlagged: boolean;
  checks: { name: string; passed: boolean }[];
  summary: string;
}

const WORKFLOW_VERSION = '0.1.0';

/**
 * Build the system prompt for the elan_flex_compatibility workflow.
 * The model is asked to analyze the provided corpus data and identify
 * interoperability issues between Jieyu and ELAN/FLEx export targets.
 */
export function buildElanFlexCompatibilitySystemPrompt(): string {
  return [
    'You are a linguistic data interoperability analyst.',
    'Analyze the provided corpus, tiers, lexemes, and annotations for issues that would affect ELAN (.eaf) or FLEx (.flextext) export/round-trip.',
    '',
    'Report findings in the following JSON structure (no markdown code fences):',
    '{',
    '  "findings": [',
    '    {',
    '      "findingId": "string (unique, e.g. f001)",',
    '      "kind": "tier_mapping | lexeme_conflict | time_gap | gloss_pos_mismatch | controlled_vocabulary_mismatch",',
    '      "severity": "info | warning | error",',
    '      "title": "short human-readable title",',
    '      "description": "detailed explanation with concrete IDs/offsets",',
    '      "evidencePackets": [',
    '        {',
    '          "id": "string", "sourceType": "segment|layer_text|lexeme|note", "sourceId": "string",',
    '          "quote": "relevant text", "confidence": 0.0-1.0, "reasonCode": "string"',
    '        }',
    '      ],',
    '      "recommendedAction": "specific fix suggestion",',
    '      "adoptionCandidateId": "optional: id if this finding proposes a writeable change"',
    '    }',
    '  ],',
    '  "summary": "1-2 sentence overall assessment",',
    '  "exportTargets": ["elan", "flex", "toolbox"]',
    '}',
    '',
    'Finding categories (cover all that apply):',
    '1. tier_mapping: EAF tier names/linguistic types do not map cleanly to Jieyu layers (e.g. missing CONSTRAINT, unexpected tier prefix, duplicate tier names).',
    '2. lexeme_conflict: A FLEx-bound lexeme form/gloss/pos conflicts with an existing Jieyu lexeme entry or creates duplicates on export.',
    '3. time_gap: Segment time ranges have gaps, overlaps, or zero-duration boundaries that ELAN/FLEx cannot represent faithfully.',
    '4. gloss_pos_mismatch: A token/morpheme has a gloss that does not match its POS, or the POS is absent where FLEx expects one.',
    '5. controlled_vocabulary_mismatch: POS tags, grammatical abbreviations, or speaker IDs use values not in the project-controlled vocabulary.',
    '',
    'Rules:',
    '- Every finding MUST include at least one evidencePacket with a concrete sourceId and quote.',
    '- Use severity "error" only when export would lose or corrupt data.',
    '- Use severity "warning" for recoverable degradation.',
    '- Use severity "info" for optimization suggestions.',
    '- If no issues are found, return an empty findings array and a positive summary.',
  ].join('\n');
}

/**
 * Parse the model output into a structured CompatibilityReport.
 * Tolerates markdown code fences and trailing content.
 */
export function parseCompatibilityReport(
  rawContent: string,
  sourceSetId?: string,
): CompatibilityReport | null {
  const trimmed = rawContent.trim();
  if (trimmed.length === 0) return null;

  // Strip markdown code fences if present
  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```\s*$/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFences);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const findingsRaw = parsed.findings;
  const summaryRaw = parsed.summary;
  const exportTargetsRaw = parsed.exportTargets;

  if (!Array.isArray(findingsRaw)) return null;
  if (typeof summaryRaw !== 'string' || summaryRaw.trim().length === 0) return null;
  if (!Array.isArray(exportTargetsRaw)) return null;

  const findings: CompatibilityFinding[] = [];
  for (const [index, f] of findingsRaw.entries()) {
    if (!isRecord(f)) continue;
    const findingId = typeof f.findingId === 'string' ? f.findingId : `f${String(index + 1).padStart(3, '0')}`;
    const kind = parseFindingKind(f.kind);
    const severity = parseSeverity(f.severity);
    const title = typeof f.title === 'string' ? f.title : findingId;
    const description = typeof f.description === 'string' ? f.description : '';
    const recommendedAction = typeof f.recommendedAction === 'string' ? f.recommendedAction : '';
    const adoptionCandidateId = typeof f.adoptionCandidateId === 'string' ? f.adoptionCandidateId : undefined;

    const evidencePackets: EvidencePacketV0[] = [];
    if (Array.isArray(f.evidencePackets)) {
      for (const ep of f.evidencePackets) {
        if (!isRecord(ep)) continue;
        const epId = typeof ep.id === 'string' ? ep.id : `${findingId}_ep_${evidencePackets.length}`;
        const sourceType = parseEvidenceSourceType(ep.sourceType);
        const sourceId = typeof ep.sourceId === 'string' ? ep.sourceId : '';
        const quote = typeof ep.quote === 'string' ? ep.quote : '';
        const confidence = typeof ep.confidence === 'number' && !Number.isNaN(ep.confidence) ? ep.confidence : 0.8;
        const reasonCode = typeof ep.reasonCode === 'string' ? ep.reasonCode : 'compatibility_finding';
        if (sourceId.length > 0) {
          evidencePackets.push(
            buildEvidencePacketV0({
              id: epId,
              sourceType,
              sourceId,
              quote,
              confidence,
              reasonCode,
            }),
          );
        }
      }
    }

    findings.push({
      findingId,
      kind,
      severity,
      title,
      description,
      evidencePackets,
      recommendedAction,
      ...(adoptionCandidateId !== undefined ? { adoptionCandidateId } : {}),
    });
  }

  return {
    reportId: `compat_${Date.now()}`,
    ...(sourceSetId !== undefined ? { sourceSetId } : {}),
    findings,
    summary: summaryRaw.trim(),
    exportTargets: exportTargetsRaw.filter((t): t is string => typeof t === 'string'),
    generatedAt: new Date().toISOString(),
    workflowVersion: WORKFLOW_VERSION,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseFindingKind(value: unknown): CompatibilityFindingKind {
  const valid: CompatibilityFindingKind[] = [
    'tier_mapping',
    'lexeme_conflict',
    'time_gap',
    'gloss_pos_mismatch',
    'controlled_vocabulary_mismatch',
  ];
  if (typeof value === 'string' && valid.includes(value as CompatibilityFindingKind)) {
    return value as CompatibilityFindingKind;
  }
  return 'tier_mapping';
}

function parseSeverity(value: unknown): CompatibilityFindingSeverity {
  const valid: CompatibilityFindingSeverity[] = ['info', 'warning', 'error'];
  if (typeof value === 'string' && valid.includes(value as CompatibilityFindingSeverity)) {
    return value as CompatibilityFindingSeverity;
  }
  return 'warning';
}

function parseEvidenceSourceType(value: unknown): EvidencePacketV0['sourceType'] {
  const valid: EvidencePacketV0['sourceType'][] = [
    'segment',
    'layer_text',
    'lexeme',
    'note',
    'document',
    'audio_region',
  ];
  if (typeof value === 'string' && valid.includes(value as EvidencePacketV0['sourceType'])) {
    return value as EvidencePacketV0['sourceType'];
  }
  return 'segment';
}

/**
 * Reflection checks for compatibility report quality.
 * 1. findings_structure_present: report has findings array (may be empty)
 * 2. summary_nonempty: summary is present and non-empty
 * 3. export_targets_present: at least one export target listed
 * 4. every_finding_has_evidence: each non-empty finding has >=1 evidence packet
 * 5. finding_kind_valid: all finding kinds are from the allowed set
 */
export function runElanFlexCompatibilityReflection(
  rawContent: string,
  _evidencePackets: readonly EvidencePacketV0[],
): ElanFlexCompatibilityReflectionResult {
  const checks: { name: string; passed: boolean }[] = [];

  // Check 1: findings structure present
  const parsed = parseCompatibilityReport(rawContent);
  const findingsStructurePresent = parsed !== null;
  checks.push({ name: 'findings_structure_present', passed: findingsStructurePresent });

  // Check 2: summary nonempty
  const summaryNonempty = parsed !== null && parsed.summary.trim().length > 0;
  checks.push({ name: 'summary_nonempty', passed: summaryNonempty });

  // Check 3: export targets present
  const exportTargetsPresent = parsed !== null && parsed.exportTargets.length > 0;
  checks.push({ name: 'export_targets_present', passed: exportTargetsPresent });

  // Check 4: every finding has evidence
  let everyFindingHasEvidence = true;
  if (parsed && parsed.findings.length > 0) {
    for (const finding of parsed.findings) {
      if (finding.evidencePackets.length === 0) {
        everyFindingHasEvidence = false;
        break;
      }
    }
  }
  checks.push({ name: 'every_finding_has_evidence', passed: everyFindingHasEvidence });

  // Check 5: finding kind valid (inspect raw JSON to catch invalid kinds before defaulting)
  let findingKindValid = true;
  try {
    const withoutFences = rawContent
      .trim()
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```\s*$/, '');
    const rawParsed: unknown = JSON.parse(withoutFences);
    if (isRecord(rawParsed) && Array.isArray(rawParsed.findings)) {
      const validKinds: readonly string[] = [
        'tier_mapping',
        'lexeme_conflict',
        'time_gap',
        'gloss_pos_mismatch',
        'controlled_vocabulary_mismatch',
      ];
      for (const f of rawParsed.findings) {
        if (isRecord(f) && typeof f.kind === 'string' && !validKinds.includes(f.kind)) {
          findingKindValid = false;
          break;
        }
      }
    }
  } catch {
    findingKindValid = false;
  }
  checks.push({ name: 'finding_kind_valid', passed: findingKindValid });

  const failedChecks = checks.filter((c) => !c.passed);
  const reflectionFlagged = failedChecks.length > 0;

  return {
    reflectionFlagged,
    checks,
    summary: reflectionFlagged
      ? `Compatibility report reflection flagged: ${failedChecks.map((c) => c.name).join(', ')}`
      : 'Compatibility report reflection passed all checks.',
  };
}

/**
 * Build a retry prompt when reflection flags the compatibility report.
 */
export function buildElanFlexCompatibilityReflectionRetryPrompt(
  result: ElanFlexCompatibilityReflectionResult,
): string {
  const failed = result.checks.filter((c) => !c.passed).map((c) => c.name);
  return [
    'The previous compatibility report did not pass quality checks.',
    `Failed checks: ${failed.join(', ')}.`,
    '',
    'Please regenerate the report, ensuring:',
    '- The output is valid JSON with a "findings" array, "summary" string, and "exportTargets" array.',
    '- Every finding includes at least one evidencePacket with sourceId and quote.',
    '- All finding "kind" values are one of: tier_mapping, lexeme_conflict, time_gap, gloss_pos_mismatch, controlled_vocabulary_mismatch.',
    '',
    'Return only the JSON object, no markdown fences.',
  ].join('\n');
}

/**
 * Convert a CompatibilityReport to a human-readable markdown string.
 * Used for export bundle generation.
 */
export function compatibilityReportToMarkdown(report: CompatibilityReport): string {
  const lines: string[] = [
    '# ELAN / FLEx Compatibility Report',
    '',
    `- **Report ID**: ${report.reportId}`,
    `- **Generated**: ${report.generatedAt}`,
    `- **Workflow Version**: ${report.workflowVersion}`,
    ...(report.sourceSetId ? [`- **Source Set**: ${report.sourceSetId}`] : []),
    `- **Export Targets**: ${report.exportTargets.join(', ') || 'none'}`,
    '',
    `## Summary`,
    '',
    report.summary,
    '',
    `## Findings (${report.findings.length})`,
    '',
  ];

  for (const finding of report.findings) {
    const severityEmoji = finding.severity === 'error' ? '🔴' : finding.severity === 'warning' ? '🟡' : '🔵';
    lines.push(`### ${severityEmoji} ${finding.title} \`(${finding.kind})\``);
    lines.push('');
    lines.push(finding.description);
    lines.push('');
    lines.push(`**Severity**: ${finding.severity}`);
    lines.push(`**Recommended Action**: ${finding.recommendedAction}`);
    if (finding.adoptionCandidateId) {
      lines.push(`**Adoption Candidate**: ${finding.adoptionCandidateId}`);
    }
    if (finding.evidencePackets.length > 0) {
      lines.push('');
      lines.push('**Evidence**:');
      for (const ep of finding.evidencePackets) {
        lines.push(`- [${ep.sourceType}] \`${ep.sourceId}\`: ${ep.quote || '(no quote)'}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
