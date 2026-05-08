/**
 * PR-P4-1: Annotation QA Reflection — lightweight self-check.
 * Runs rule-based consistency checks on the assistant output + evidence packets.
 * Must complete in <1ms; no LLM involved.
 */

import type { EvidencePacketV0 } from './evidencePacket';

export interface AnnotationQaReflectionResult {
  reflectionFlagged: boolean;
  checks: AnnotationQaReflectionCheck[];
  summary: string;
}

interface AnnotationQaReflectionCheck {
  name: string;
  passed: boolean;
  detail: string;
}

const FINDING_MARKER_RE = /\[\d+\]/g;
const LOW_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Run lightweight reflection checks on an annotation_qa turn.
 * Does not block user-visible output; intended to run after stream completion.
 */
export function runAnnotationQaReflection(
  assistantContent: string,
  evidencePackets: readonly EvidencePacketV0[],
): AnnotationQaReflectionResult {
  const checks: AnnotationQaReflectionCheck[] = [];
  const evidenceCount = evidencePackets.length;

  // Check 1: citation marker count vs evidence packet count
  const citationMarkers = assistantContent.match(FINDING_MARKER_RE) ?? [];
  const uniqueCitations = new Set(citationMarkers).size;
  checks.push({
    name: 'citation_count_match',
    passed: uniqueCitations <= evidenceCount,
    detail: `content has ${uniqueCitations} unique citation markers, envelope has ${evidenceCount} evidence packets`,
  });

  // Check 2: all evidence packets have non-empty sourceId
  const emptySourceIds = evidencePackets.filter((ep) => !ep.sourceId || ep.sourceId.trim().length === 0);
  checks.push({
    name: 'source_id_nonempty',
    passed: emptySourceIds.length === 0,
    detail: emptySourceIds.length === 0
      ? 'all evidence packets have non-empty sourceId'
      : `${emptySourceIds.length} evidence packet(s) have empty sourceId`,
  });

  // Check 3: confidence values within [0, 1]
  const outOfBounds = evidencePackets.filter(
    (ep) => typeof ep.confidence === 'number' && (ep.confidence < 0 || ep.confidence > 1),
  );
  checks.push({
    name: 'confidence_in_bounds',
    passed: outOfBounds.length === 0,
    detail: outOfBounds.length === 0
      ? 'all confidence values within [0, 1]'
      : `${outOfBounds.length} confidence value(s) out of bounds`,
  });

  // Check 4: no abnormally low confidence (< 0.5) when evidence exists
  const lowConfidence = evidencePackets.filter(
    (ep) => typeof ep.confidence === 'number' && ep.confidence < LOW_CONFIDENCE_THRESHOLD,
  );
  checks.push({
    name: 'confidence_not_abnormally_low',
    passed: evidenceCount === 0 || lowConfidence.length === 0,
    detail: evidenceCount === 0
      ? 'no evidence packets to check'
      : lowConfidence.length === 0
        ? 'no confidence values below 0.5'
        : `${lowConfidence.length} confidence value(s) below 0.5`,
  });

  // Check 5: quote fields are non-empty when evidence exists
  const emptyQuotes = evidencePackets.filter((ep) => !ep.quote || ep.quote.trim().length === 0);
  checks.push({
    name: 'quote_nonempty',
    passed: evidenceCount === 0 || emptyQuotes.length === 0,
    detail: evidenceCount === 0
      ? 'no evidence packets to check'
      : emptyQuotes.length === 0
        ? 'all evidence packets have non-empty quote'
        : `${emptyQuotes.length} evidence packet(s) have empty quote`,
  });

  // Check 6: annotation_qa findings should contain at least one structural marker
  const hasFindingStructure = /(finding|issue|problem|inconsistency|missing|error)/i.test(assistantContent);
  checks.push({
    name: 'findings_structure_present',
    passed: hasFindingStructure || assistantContent.length < 100,
    detail: hasFindingStructure
      ? 'findings structure markers detected'
      : 'no findings structure markers (finding/issue/problem/inconsistency/missing/error)',
  });

  // Check 6: inline [n] markers must be within 1..evidenceCount when evidence exists
  const markerIndices = [...assistantContent.matchAll(/\[(\d+)\]/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  const outOfRangeMarkers = evidenceCount > 0
    ? markerIndices.filter((n) => n < 1 || n > evidenceCount)
    : [];
  checks.push({
    name: 'citation_index_within_evidence',
    passed: evidenceCount === 0 || outOfRangeMarkers.length === 0,
    detail: evidenceCount === 0
      ? 'no evidence packets; marker range not enforced'
      : outOfRangeMarkers.length === 0
        ? 'all citation indices within evidence list'
        : `citation index(es) out of range: ${outOfRangeMarkers.join(', ')} (valid 1..${evidenceCount})`,
  });

  const failedChecks = checks.filter((c) => !c.passed);
  const reflectionFlagged = failedChecks.length > 0;
  const summary = reflectionFlagged
    ? `reflection flagged: ${failedChecks.map((c) => c.name).join(', ')}`
    : 'all reflection checks passed';

  return { reflectionFlagged, checks, summary };
}

/**
 * Build a retry prompt snippet based on reflection failures.
 */
export function buildAnnotationQaReflectionRetryPrompt(result: AnnotationQaReflectionResult): string {
  if (!result.reflectionFlagged) return '';

  const failed = result.checks.filter((c) => !c.passed);
  const lines: string[] = [
    'Please correct the following issues identified in the previous response:',
  ];

  for (const check of failed) {
    switch (check.name) {
      case 'citation_count_match':
        lines.push('- Ensure every citation marker [N] corresponds to an available evidence packet.');
        break;
      case 'source_id_nonempty':
        lines.push('- Every evidence packet must have a non-empty sourceId.');
        break;
      case 'confidence_in_bounds':
        lines.push('- Confidence values must be within [0, 1].');
        break;
      case 'confidence_not_abnormally_low':
        lines.push('- Confidence values should not be below 0.5 when evidence is present.');
        break;
      case 'quote_nonempty':
        lines.push('- Every evidence packet must have a non-empty quote field.');
        break;
      case 'findings_structure_present':
        lines.push('- Please structure findings using clear markers (finding/issue/problem/inconsistency/missing/error).');
        break;
      case 'citation_index_within_evidence':
        lines.push('- Citation markers [N] must use indices from 1 up to the number of evidence packets only.');
        break;
      default:
        lines.push(`- ${check.detail}`);
    }
  }

  return lines.join('\n');
}
