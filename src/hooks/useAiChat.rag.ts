import { type AiMessageCitation, getDb } from '../db';
import type { AiPromptContext } from '../ai/chat/chatDomain.types';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import { extractPdfSnippet } from '../ai/embeddings/pdfTextUtils';
import { splitPdfCitationRef } from '../utils/citationJumpUtils';
import { normalizeCitationSnippetPlainText, RAG_CITATION_INSTRUCTION } from '../utils/citationFootnoteUtils';
import { isSearchFusionScenario, type SearchFusionScenario } from '../ai/embeddings/searchFusionProfiles';
import { evaluateRagQuality } from '../ai/embeddings/ragQualityEvaluator';
import { shouldRetrieve } from '../ai/ragReflection';
import { withTimeout } from './useAiChat.config';
import { createLogger } from '../observability/logger';
import { createMetricTags, recordMetric } from '../observability/metrics';
import { listUtteranceTextsByUtterance } from '../services/LayerSegmentationTextService';

const log = createLogger('useAiChat.rag');

/**
 * When `unitIndexComplete` is false, returns null (do not label hits/misses).
 * When `localUnitIndex` is missing, returns null.
 * Empty array yields an empty Set (every utterance id is a miss).
 */
export function buildLocalUnitIdSetForRagCitationCheck(
  context: AiPromptContext | null | undefined,
): Set<string> | null {
  if (!context?.shortTerm) return null;
  if (context.shortTerm.unitIndexComplete === false) return null;
  const rows = context.shortTerm.localUnitIndex;
  if (!Array.isArray(rows)) return null;
  return new Set(
    rows
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  );
}

export interface RagEnrichmentResult {
  contextBlock: string;
  citations: AiMessageCitation[];
  /** Self-RAG 反思判定 | Self-RAG reflection verdict */
  reflectionVerdict?: 'skip' | 'force' | 'retrieve';
  /** CRAG 质量判定 | CRAG quality verdict (only set when CRAG runs) */
  cragVerdict?: 'correct' | 'ambiguous' | 'incorrect';
}

interface EnrichContextWithRagParams {
  embeddingSearchService: EmbeddingSearchService | null | undefined;
  userText: string;
  contextBlock: string;
  ragContextTimeoutMs: number;
  /** Same-turn prompt context: epoch + localUnitIndex for citation grounding metadata. */
  promptContext?: AiPromptContext | null;
}

const RAG_SCENARIO_TOKEN_RE = /\[RAG_SCENARIO:(qa|review|terminology|balanced)\]/i;

export function resolveRagFusionScenarioInput(userText: string): {
  scenario: SearchFusionScenario;
  queryText: string;
} {
  const normalized = userText.trim();
  const tokenMatch = normalized.match(RAG_SCENARIO_TOKEN_RE);
  if (tokenMatch) {
    const candidate = tokenMatch[1]?.toLowerCase() ?? '';
    const scenario = isSearchFusionScenario(candidate) ? candidate : 'qa';
    const queryText = normalized.replace(RAG_SCENARIO_TOKEN_RE, '').trim();
    return {
      scenario,
      queryText: queryText || normalized,
    };
  }

  if (/^【审校模板】/.test(normalized)) {
    return {
      scenario: 'review',
      queryText: normalized.replace(/^【审校模板】/, '').trim() || normalized,
    };
  }
  if (/^【术语查证模板】/.test(normalized)) {
    return {
      scenario: 'terminology',
      queryText: normalized.replace(/^【术语查证模板】/, '').trim() || normalized,
    };
  }
  if (/^【问答模板】/.test(normalized)) {
    return {
      scenario: 'qa',
      queryText: normalized.replace(/^【问答模板】/, '').trim() || normalized,
    };
  }

  return {
    scenario: 'qa',
    queryText: normalized,
  };
}

export function normalizeRagCitationSnippet(snippet: string): string {
  return normalizeCitationSnippetPlainText(snippet).slice(0, 300);
}

export async function enrichContextWithRag({
  embeddingSearchService,
  userText,
  contextBlock,
  ragContextTimeoutMs,
  promptContext,
}: EnrichContextWithRagParams): Promise<RagEnrichmentResult> {
  if (!embeddingSearchService) {
    return { contextBlock, citations: [] };
  }

  // Self-RAG 反思判断：跳过闲聊/纯操作指令，避免无效检索
  // Self-RAG reflection gate: skip greetings and pure commands
  const reflectionVerdict = shouldRetrieve(userText);
  if (reflectionVerdict === 'skip') {
    log.debug('Self-RAG: skip verdict, bypassing retrieval', {
      preview: userText.slice(0, 60),
    });
    return { contextBlock, citations: [], reflectionVerdict: 'skip' };
  }

  try {
    const { scenario, queryText } = resolveRagFusionScenarioInput(userText);
    // force 判定：扩大召回范围（topK 8、更低阈值），跳过 CRAG 质量门控
    // force verdict: widen recall (topK 8, lower threshold), skip CRAG quality gate
    const isForced = reflectionVerdict === 'force';
    const searchTopK = isForced ? 8 : 5;
    const ragResult = await withTimeout(
      embeddingSearchService.searchMultiSourceHybrid(
        queryText,
        ['utterance', 'note', 'pdf'],
        { topK: searchTopK, fusionScenario: scenario },
      ),
      ragContextTimeoutMs,
      `RAG context timed out after ${ragContextTimeoutMs}ms`,
    );

    let activeMatches = ragResult.matches;
    if (activeMatches.length === 0) {
      const fallbackResult = await withTimeout(
        embeddingSearchService.searchMultiSourceHybrid(
          queryText,
          ['utterance', 'note', 'pdf'],
          { topK: searchTopK, fusionScenario: scenario, minScore: isForced ? 0.05 : 0.1 },
        ),
        ragContextTimeoutMs,
        `RAG fallback timed out after ${ragContextTimeoutMs}ms`,
      );
      activeMatches = fallbackResult.matches;
    }

    // CRAG 质量评估：三路分支（correct / ambiguous / incorrect）
    // force 判定跳过 CRAG 门控（用户明确需要检索结果）
    // CRAG quality gate: three-branch verdict; force verdict bypasses gate
    let cragVerdict: 'correct' | 'ambiguous' | 'incorrect' | undefined;
    if (!isForced) {
      const ragQuality = evaluateRagQuality(activeMatches, queryText);
      cragVerdict = ragQuality.verdict;
      if (ragQuality.verdict === 'incorrect') {
        log.debug('CRAG: incorrect verdict, skipping RAG injection', {
          maxScore: ragQuality.maxScore,
          queryPreview: queryText.slice(0, 80),
        });
        return { contextBlock, citations: [], reflectionVerdict, cragVerdict: 'incorrect' };
      }
      if (ragQuality.verdict === 'ambiguous' && ragQuality.refinedQuery) {
        // AMBIGUOUS: 用扩展查询重搜一次，关键词权重 0.45 | Re-search with keyword expansion
        log.debug('CRAG: ambiguous verdict, re-searching with queryExpansion profile', {
          maxScore: ragQuality.maxScore,
          scoreGap: ragQuality.scoreGap,
          refinedQuery: ragQuality.refinedQuery.slice(0, 60),
        });
        try {
          const expandedResult = await withTimeout(
            embeddingSearchService.searchMultiSourceHybrid(
              ragQuality.refinedQuery,
              ['utterance', 'note', 'pdf'],
              { topK: 5, fusionScenario: 'queryExpansion' },
            ),
            ragContextTimeoutMs,
            `CRAG re-search timed out after ${ragContextTimeoutMs}ms`,
          );
          if (expandedResult.matches.length > 0) {
            activeMatches = expandedResult.matches;
          }
        } catch (expandErr) {
          log.warn('CRAG re-search failed, continuing with original matches', {
            error: expandErr instanceof Error ? expandErr.message : String(expandErr),
          });
        }
      }
    } else {
      log.debug('Self-RAG: force verdict, bypassing CRAG quality gate', {
        matchCount: activeMatches.length,
        queryPreview: queryText.slice(0, 60),
      });
    }

    if (activeMatches.length === 0) {
      log.debug('RAG no matches after CRAG evaluation, proceeding without context augmentation', {
        queryPreview: queryText.slice(0, 80),
        scenario,
      });
      return { contextBlock, citations: [], reflectionVerdict };
    }

    const db = await getDb();
    const idSet = buildLocalUnitIdSetForRagCitationCheck(promptContext);
    const readModelEpoch = promptContext?.shortTerm?.timelineReadModelEpoch;
    type RagSourceRow = {
      contextTag: string;
      safeSnippet: string;
      citation: AiMessageCitation;
    } | null;

    const settledResults = await Promise.allSettled(
      activeMatches.map(async (match): Promise<RagSourceRow> => {
        let snippet = '';

        if (match.sourceType === 'note') {
          // 分块笔记 sourceId 带 #chunk=N 后缀，需取 baseRef 查库 | Chunked note sourceId has #chunk=N suffix, strip to base ID for DB lookup
          const { baseRef: noteBaseId } = splitPdfCitationRef(match.sourceId);
          const noteRows = await db.collections.user_notes.findByIndex('id', noteBaseId);
          const noteDoc = noteRows[0]?.toJSON();
          if (noteDoc?.content) {
            const contentByLang = noteDoc.content as Record<string, string>;
            snippet = (contentByLang['und'] ?? contentByLang['en'] ?? Object.values(contentByLang).find((value) => value.trim()) ?? '').trim();
          }
        } else if (match.sourceType === 'utterance') {
            const textRows = await listUtteranceTextsByUtterance(db, match.sourceId);
            const textWithContent = textRows.find((row) => row.text?.trim());
            snippet = textWithContent?.text?.trim() ?? '';
        } else if (match.sourceType === 'pdf') {
          const { baseRef } = splitPdfCitationRef(match.sourceId);
          const mediaRows = await db.collections.media_items.findByIndex('id', baseRef);
          const mediaDoc = mediaRows[0]?.toJSON();
          const details = mediaDoc?.details as Record<string, unknown> | undefined;
          snippet = extractPdfSnippet(details, 300);
        }

        const normalizedSnippet = normalizeRagCitationSnippet(snippet);
        if (!normalizedSnippet) return null;

        const label = match.sourceType === 'note'
          ? '笔记参考'
          : (match.sourceType === 'utterance' ? '句段参考' : '文档参考');
        const contextTag = match.sourceType === 'note'
          ? 'NOTE_CONTEXT'
          : (match.sourceType === 'utterance' ? 'UTTERANCE_CONTEXT' : 'PDF_CONTEXT');
        const safeSnippet = normalizedSnippet.replace(/[\[\]]/g, (char) => (char === '[' ? '【' : '】'));
        const validCitationTypes: Array<'note' | 'utterance' | 'pdf' | 'schema'> = ['note', 'utterance', 'pdf', 'schema'];
        if (!validCitationTypes.includes(match.sourceType as typeof validCitationTypes[number])) return null;

        let readModelIndexHit: boolean | undefined;
        if (match.sourceType === 'utterance' && idSet !== null) {
          const utteranceRef = match.sourceId.trim();
          readModelIndexHit = idSet.has(utteranceRef);
          if (!readModelIndexHit) {
            recordMetric({
              id: 'ai.rag_citation_read_model_miss',
              value: 1,
              tags: createMetricTags('useAiChat.rag', {
                refIdPrefix: utteranceRef.length > 48 ? `${utteranceRef.slice(0, 48)}…` : utteranceRef,
              }),
            });
          }
        }

        const citation: AiMessageCitation = {
          type: match.sourceType as 'note' | 'utterance' | 'pdf' | 'schema',
          refId: match.sourceId,
          label,
          snippet: normalizedSnippet,
          ...(typeof readModelEpoch === 'number' && Number.isFinite(readModelEpoch)
            ? { readModelEpochAtRetrieval: readModelEpoch }
            : {}),
          ...(readModelIndexHit !== undefined ? { readModelIndexHit } : {}),
        };

        return {
          contextTag,
          safeSnippet,
          citation,
        };
      }),
    );

    const rawRagResults = settledResults
      .filter((r): r is PromiseFulfilledResult<RagSourceRow> => r.status === 'fulfilled')
      .map((r) => r.value);

    const rejectedCount = settledResults.filter((r) => r.status === 'rejected').length;
    if (rejectedCount > 0) {
      log.warn(`RAG enrichment: ${rejectedCount}/${activeMatches.length} lookups failed, continuing with successful results`);
    }

    const rawRagSources = rawRagResults.filter((row): row is NonNullable<typeof row> =>
      row !== null && ['note', 'utterance', 'pdf'].includes(row.citation.type),
    );
    const seen = new Set<string>();
    const dedupedSources = rawRagSources.filter((source) => {
      // 同一笔记/PDF 不同 chunk 归一化为同一 base ID 去重 | Normalize chunk sourceIds to base ID for dedup
      const { baseRef } = splitPdfCitationRef(source.citation.refId);
      const key = `${source.citation.type}:${baseRef}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (dedupedSources.length === 0) {
      return { contextBlock, citations: [], reflectionVerdict, ...(cragVerdict !== undefined && { cragVerdict }) };
    }

    const ragLines = dedupedSources.map(
      (source, index) => `[${index + 1}] (${source.contextTag}) ${source.safeSnippet}`,
    );
    return {
      contextBlock: `${contextBlock}\n[RELEVANT_CONTEXT]\n${ragLines.join('\n')}\n${RAG_CITATION_INSTRUCTION}`,
      citations: dedupedSources.map((source) => source.citation),
      reflectionVerdict,
      ...(cragVerdict !== undefined && { cragVerdict }),
    };
  } catch (error) {
    // 区分可恢复与不可恢复错误 | Distinguish recoverable from non-recoverable errors
    if (error instanceof TypeError || error instanceof ReferenceError || error instanceof SyntaxError) {
      log.error('RAG context enrichment hit programming error', {
        error: error.message,
        stack: error.stack,
      });
    } else {
      log.warn('RAG context enrichment failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { contextBlock, citations: [], reflectionVerdict };
  }
}
