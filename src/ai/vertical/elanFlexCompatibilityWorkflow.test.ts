import { describe, expect, it } from 'vitest';
import {
  buildElanFlexCompatibilitySystemPrompt,
  parseCompatibilityReport,
  runElanFlexCompatibilityReflection,
  buildElanFlexCompatibilityReflectionRetryPrompt,
  compatibilityReportToMarkdown,
  type CompatibilityReport,
} from './elanFlexCompatibilityWorkflow';

describe('buildElanFlexCompatibilitySystemPrompt', () => {
  it('includes all 5 finding kinds', () => {
    const prompt = buildElanFlexCompatibilitySystemPrompt();
    expect(prompt).toContain('tier_mapping');
    expect(prompt).toContain('lexeme_conflict');
    expect(prompt).toContain('time_gap');
    expect(prompt).toContain('gloss_pos_mismatch');
    expect(prompt).toContain('controlled_vocabulary_mismatch');
  });

  it('mentions JSON structure', () => {
    const prompt = buildElanFlexCompatibilitySystemPrompt();
    expect(prompt).toContain('"findings"');
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"exportTargets"');
  });
});

describe('parseCompatibilityReport', () => {
  it('parses valid JSON report', () => {
    const raw = JSON.stringify({
      findings: [
        {
          findingId: 'f001',
          kind: 'tier_mapping',
          severity: 'warning',
          title: 'Tier name mismatch',
          description: 'Layer "translation" maps to EAF tier "Translation-Gloss" which may not round-trip.',
          evidencePackets: [
            { id: 'ep1', sourceType: 'layer_text', sourceId: 'layer-1', quote: 'translation', confidence: 0.9, reasonCode: 'tier_name_mismatch' },
          ],
          recommendedAction: 'Standardize tier name to match ELAN convention.',
        },
      ],
      summary: 'One tier mapping issue found; export to ELAN may need manual review.',
      exportTargets: ['elan', 'flex'],
    });
    const report = parseCompatibilityReport(raw, 'set-1');
    expect(report).not.toBeNull();
    expect(report!.findings).toHaveLength(1);
    expect(report!.findings[0]!.kind).toBe('tier_mapping');
    expect(report!.findings[0]!.severity).toBe('warning');
    expect(report!.sourceSetId).toBe('set-1');
    expect(report!.exportTargets).toEqual(['elan', 'flex']);
    expect(report!.workflowVersion).toBe('0.1.0');
  });

  it('parses JSON inside markdown fences', () => {
    const raw = '```json\n' + JSON.stringify({
      findings: [],
      summary: 'No issues found.',
      exportTargets: ['elan'],
    }) + '\n```';
    const report = parseCompatibilityReport(raw);
    expect(report).not.toBeNull();
    expect(report!.findings).toHaveLength(0);
    expect(report!.summary).toBe('No issues found.');
  });

  it('returns null for empty content', () => {
    expect(parseCompatibilityReport('')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseCompatibilityReport('not json')).toBeNull();
  });

  it('returns null for missing findings array', () => {
    expect(parseCompatibilityReport(JSON.stringify({ summary: 'ok', exportTargets: [] }))).toBeNull();
  });

  it('assigns default findingId when missing', () => {
    const raw = JSON.stringify({
      findings: [{ kind: 'time_gap', severity: 'error', title: 'Gap', description: 'd', evidencePackets: [], recommendedAction: 'fix' }],
      summary: 's',
      exportTargets: [],
    });
    const report = parseCompatibilityReport(raw);
    expect(report!.findings[0]!.findingId).toBe('f001');
  });

  it('filters evidence packets with empty sourceId', () => {
    const raw = JSON.stringify({
      findings: [{
        findingId: 'f1',
        kind: 'lexeme_conflict',
        severity: 'warning',
        title: 'Conflict',
        description: 'd',
        evidencePackets: [
          { id: 'ep1', sourceType: 'lexeme', sourceId: '', quote: 'q', confidence: 0.8 },
          { id: 'ep2', sourceType: 'lexeme', sourceId: 'lex-1', quote: 'q2', confidence: 0.8 },
        ],
        recommendedAction: 'merge',
      }],
      summary: 's',
      exportTargets: ['flex'],
    });
    const report = parseCompatibilityReport(raw);
    expect(report!.findings[0]!.evidencePackets).toHaveLength(1);
    expect(report!.findings[0]!.evidencePackets[0]!.sourceId).toBe('lex-1');
  });

  it('defaults unknown kind to tier_mapping', () => {
    const raw = JSON.stringify({
      findings: [{ kind: 'unknown_kind', severity: 'info', title: 'T', description: 'd', evidencePackets: [], recommendedAction: 'r' }],
      summary: 's',
      exportTargets: [],
    });
    const report = parseCompatibilityReport(raw);
    expect(report!.findings[0]!.kind).toBe('tier_mapping');
  });

  it('defaults unknown severity to warning', () => {
    const raw = JSON.stringify({
      findings: [{ kind: 'time_gap', severity: 'critical', title: 'T', description: 'd', evidencePackets: [], recommendedAction: 'r' }],
      summary: 's',
      exportTargets: [],
    });
    const report = parseCompatibilityReport(raw);
    expect(report!.findings[0]!.severity).toBe('warning');
  });
});

describe('runElanFlexCompatibilityReflection', () => {
  it('passes when all checks satisfied', () => {
    const raw = JSON.stringify({
      findings: [
        {
          findingId: 'f001',
          kind: 'tier_mapping',
          severity: 'warning',
          title: 'Tier mismatch',
          description: 'd',
          evidencePackets: [{ id: 'ep1', sourceType: 'segment', sourceId: 's1', quote: 'q', confidence: 0.9, reasonCode: 'r' }],
          recommendedAction: 'a',
        },
      ],
      summary: 'One issue found.',
      exportTargets: ['elan'],
    });
    const result = runElanFlexCompatibilityReflection(raw, []);
    expect(result.reflectionFlagged).toBe(false);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('flags when findings structure missing', () => {
    const result = runElanFlexCompatibilityReflection('not json', []);
    expect(result.reflectionFlagged).toBe(true);
    const failed = result.checks.filter((c) => !c.passed);
    expect(failed.some((c) => c.name === 'findings_structure_present')).toBe(true);
  });

  it('flags when summary is empty', () => {
    const raw = JSON.stringify({ findings: [], summary: '   ', exportTargets: ['elan'] });
    const result = runElanFlexCompatibilityReflection(raw, []);
    expect(result.reflectionFlagged).toBe(true);
    const failed = result.checks.filter((c) => !c.passed);
    expect(failed.some((c) => c.name === 'summary_nonempty')).toBe(true);
  });

  it('flags when export targets missing', () => {
    const raw = JSON.stringify({ findings: [], summary: 'ok', exportTargets: [] });
    const result = runElanFlexCompatibilityReflection(raw, []);
    expect(result.reflectionFlagged).toBe(true);
    const failed = result.checks.filter((c) => !c.passed);
    expect(failed.some((c) => c.name === 'export_targets_present')).toBe(true);
  });

  it('flags when a finding lacks evidence', () => {
    const raw = JSON.stringify({
      findings: [
        { findingId: 'f1', kind: 'time_gap', severity: 'error', title: 'Gap', description: 'd', evidencePackets: [], recommendedAction: 'fix' },
      ],
      summary: 'One issue.',
      exportTargets: ['elan'],
    });
    const result = runElanFlexCompatibilityReflection(raw, []);
    expect(result.reflectionFlagged).toBe(true);
    const failed = result.checks.filter((c) => !c.passed);
    expect(failed.some((c) => c.name === 'every_finding_has_evidence')).toBe(true);
  });

  it('flags when finding kind is invalid', () => {
    const raw = JSON.stringify({
      findings: [
        { findingId: 'f1', kind: 'invalid_kind', severity: 'warning', title: 'T', description: 'd', evidencePackets: [{ id: 'ep1', sourceType: 'segment', sourceId: 's1', quote: 'q', confidence: 0.8 }], recommendedAction: 'a' },
      ],
      summary: 'One issue.',
      exportTargets: ['elan'],
    });
    const result = runElanFlexCompatibilityReflection(raw, []);
    expect(result.reflectionFlagged).toBe(true);
    const failed = result.checks.filter((c) => !c.passed);
    expect(failed.some((c) => c.name === 'finding_kind_valid')).toBe(true);
  });

  it('passes every_finding_has_evidence when findings array is empty', () => {
    const raw = JSON.stringify({ findings: [], summary: 'Clean.', exportTargets: ['elan'] });
    const result = runElanFlexCompatibilityReflection(raw, []);
    expect(result.checks.find((c) => c.name === 'every_finding_has_evidence')!.passed).toBe(true);
  });
});

describe('buildElanFlexCompatibilityReflectionRetryPrompt', () => {
  it('mentions failed checks', () => {
    const result = {
      reflectionFlagged: true,
      checks: [
        { name: 'summary_nonempty', passed: false },
        { name: 'export_targets_present', passed: true },
      ],
      summary: 'flagged',
    };
    const prompt = buildElanFlexCompatibilityReflectionRetryPrompt(result);
    expect(prompt).toContain('summary_nonempty');
    expect(prompt).not.toContain('export_targets_present');
  });
});

describe('compatibilityReportToMarkdown', () => {
  it('renders report as markdown', () => {
    const report: CompatibilityReport = {
      reportId: 'r001',
      sourceSetId: 'set-1',
      findings: [
        {
          findingId: 'f001',
          kind: 'tier_mapping',
          severity: 'warning',
          title: 'Tier Mismatch',
          description: 'Layer X does not map.',
          evidencePackets: [{ schemaVersion: 0, id: 'ep1', sourceType: 'layer_text', sourceId: 'layer-1', quote: 'translation', confidence: 0.9, reasonCode: 'r' }],
          recommendedAction: 'Rename layer.',
          adoptionCandidateId: 'adopt-1',
        },
      ],
      summary: 'One issue found.',
      exportTargets: ['elan'],
      generatedAt: '2026-05-06T12:00:00Z',
      workflowVersion: '0.1.0',
    };
    const md = compatibilityReportToMarkdown(report);
    expect(md).toContain('# ELAN / FLEx Compatibility Report');
    expect(md).toContain('Tier Mismatch');
    expect(md).toContain('tier_mapping');
    expect(md).toContain('Rename layer.');
    expect(md).toContain('Adoption Candidate');
    expect(md).toContain('layer-1');
  });

  it('renders empty findings', () => {
    const report: CompatibilityReport = {
      reportId: 'r002',
      findings: [],
      summary: 'No issues.',
      exportTargets: [],
      generatedAt: '2026-05-06T12:00:00Z',
      workflowVersion: '0.1.0',
    };
    const md = compatibilityReportToMarkdown(report);
    expect(md).toContain('Findings (0)');
  });
});
