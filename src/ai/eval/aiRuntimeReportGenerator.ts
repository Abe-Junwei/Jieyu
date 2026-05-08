/**
 * PR-P3/P4: AiRuntimeReport production generator.
 * Reads from Dexie audit_logs and generates a runtime report.
 */

import { getDb } from '../../db';
import {
  buildAiRuntimeReportWithContext,
  type AiRuntimeReport,
  type ContextualCitationResult,
  type ContextualRelevanceResult,
} from './aiRuntimeReport';
import {
  collectReflectionFailedChecks,
  collectToolDecisionRecords,
} from './aiRuntimeReportDimensionalAudit';

/**
 * Collect adoption outcome metadataJson strings from Dexie audit_logs.
 * Best-effort; returns empty array on read failure.
 */
export async function collectAdoptionOutcomeMetadataJsons(): Promise<string[]> {
  try {
    const db = await getDb();
    const rows = await db.collections.audit_logs.findByIndex('collection', 'ai_messages' as string);
    return rows
      .filter((r) => typeof r.field === 'string' && r.field === 'ai_adoption_outcome')
      .map((r) => r.metadataJson)
      .filter((m): m is string => typeof m === 'string' && m.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Collect citation judge results from Dexie audit_logs (ai_citation_judge field).
 */
async function collectCitationJudgeResults(): Promise<ContextualCitationResult[]> {
  try {
    const db = await getDb();
    const rows = await db.collections.audit_logs.findByIndex('collection', 'ai_messages' as string);
    const results: ContextualCitationResult[] = [];
    for (const row of rows) {
      if (typeof row.field !== 'string' || row.field !== 'ai_citation_judge') continue;
      if (typeof row.metadataJson !== 'string') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.metadataJson);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      const p = parsed as Record<string, unknown>;
      const averageScore = typeof p.averageScore === 'number' ? p.averageScore : 0;
      results.push({
        result: {
          overallScore: averageScore,
          dimensions: {
            sourceId: { score: averageScore, reasoning: 'aggregated' },
            quote: { score: averageScore, reasoning: 'aggregated' },
            confidence: { score: averageScore, reasoning: 'aggregated' },
          },
          reasoning: 'aggregated from audit log',
        },
        context: {
          requestId: typeof row.requestId === 'string' ? row.requestId : 'unknown',
          ...(typeof p.workflowId === 'string' ? { workflowId: p.workflowId } : {}),
          ...(typeof p.providerId === 'string' ? { providerId: p.providerId } : {}),
        },
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Collect relevance judge results from Dexie audit_logs (ai_relevance_judge field).
 */
async function collectRelevanceJudgeResults(): Promise<ContextualRelevanceResult[]> {
  try {
    const db = await getDb();
    const rows = await db.collections.audit_logs.findByIndex('collection', 'ai_messages' as string);
    const results: ContextualRelevanceResult[] = [];
    for (const row of rows) {
      if (typeof row.field !== 'string' || row.field !== 'ai_relevance_judge') continue;
      if (typeof row.metadataJson !== 'string') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.metadataJson);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      const p = parsed as Record<string, unknown>;
      const overallScore = typeof p.overallScore === 'number' ? p.overallScore : 0;
      results.push({
        result: {
          overallScore,
          dimensions: {
            topicAlignment: { score: overallScore, reasoning: 'aggregated' },
            completeness: { score: overallScore, reasoning: 'aggregated' },
            conciseness: { score: overallScore, reasoning: 'aggregated' },
          },
          reasoning: 'aggregated from audit log',
        },
        context: {
          requestId: typeof row.requestId === 'string' ? row.requestId : 'unknown',
          ...(typeof p.workflowId === 'string' ? { workflowId: p.workflowId } : {}),
          ...(typeof p.providerId === 'string' ? { providerId: p.providerId } : {}),
        },
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Generate an AiRuntimeReport from available audit data.
 * Reads citation / relevance judge results and adoption outcomes from audit_logs.
 */
/**
 * Collect raw occurrence counts for all audit log fields in the ai_messages collection.
 * Best-effort; returns empty record on read failure.
 */
async function collectAuditFieldCounts(): Promise<Record<string, number>> {
  try {
    const db = await getDb();
    const rows = await db.collections.audit_logs.findByIndex('collection', 'ai_messages' as string);
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (typeof row.field === 'string') {
        counts[row.field] = (counts[row.field] ?? 0) + 1;
      }
    }
    return counts;
  } catch {
    return {};
  }
}

export async function generateAiRuntimeReportFromAudit(): Promise<AiRuntimeReport> {
  const [
    adoptionOutcomeMetadataJsons,
    citationResults,
    relevanceResults,
    reflectionFailedChecks,
    toolDecisionRecords,
    rawAuditCounts,
  ] = await Promise.all([
    collectAdoptionOutcomeMetadataJsons(),
    collectCitationJudgeResults(),
    collectRelevanceJudgeResults(),
    collectReflectionFailedChecks(),
    collectToolDecisionRecords(),
    collectAuditFieldCounts(),
  ]);
  return buildAiRuntimeReportWithContext(citationResults, relevanceResults, 50, {
    adoptionOutcomeMetadataJsons,
    reflectionFailedChecks,
    toolDecisionRecords,
    rawAuditCounts,
  });
}
