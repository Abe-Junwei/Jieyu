import { type AiMessageCitation, getDb } from '../db';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import { extractPdfSnippet } from '../ai/embeddings/pdfTextUtils';
import { splitPdfCitationRef } from '../utils/citationJumpUtils';
import { RAG_CITATION_INSTRUCTION } from '../utils/citationFootnoteUtils';
import { withTimeout } from './useAiChat.config';
import { createLogger } from '../observability/logger';
import { listUtteranceTextsByUtterance } from '../services/LayerSegmentationTextService';

const log = createLogger('useAiChat.rag');

export interface RagEnrichmentResult {
  contextBlock: string;
  citations: AiMessageCitation[];
}

interface EnrichContextWithRagParams {
  embeddingSearchService: EmbeddingSearchService | null | undefined;
  userText: string;
  contextBlock: string;
  ragContextTimeoutMs: number;
}

export async function enrichContextWithRag({
  embeddingSearchService,
  userText,
  contextBlock,
  ragContextTimeoutMs,
}: EnrichContextWithRagParams): Promise<RagEnrichmentResult> {
  if (!embeddingSearchService) {
    return { contextBlock, citations: [] };
  }

  try {
    const ragResult = await withTimeout(
      embeddingSearchService.searchMultiSourceHybrid(
        userText,
        ['utterance', 'note', 'pdf'],
        { topK: 5, fusionScenario: 'qa' },
      ),
      ragContextTimeoutMs,
      `RAG context timed out after ${ragContextTimeoutMs}ms`,
    );

    let activeMatches = ragResult.matches;
    if (activeMatches.length === 0) {
      const fallbackResult = await withTimeout(
        embeddingSearchService.searchMultiSourceHybrid(
          userText,
          ['utterance', 'note', 'pdf'],
          { topK: 5, fusionScenario: 'qa', minScore: 0.1 },
        ),
        ragContextTimeoutMs,
        `RAG fallback timed out after ${ragContextTimeoutMs}ms`,
      );
      activeMatches = fallbackResult.matches;
    }

    if (activeMatches.length === 0) {
      log.debug('RAG no matches, proceeding without context augmentation', {
        queryPreview: userText.slice(0, 80),
      });
      return { contextBlock, citations: [] };
    }

    const db = await getDb();
    type RagSourceRow = {
      contextTag: string;
      safeSnippet: string;
      citation: AiMessageCitation;
    } | null;

    const settledResults = await Promise.allSettled(
      activeMatches.map(async (match): Promise<RagSourceRow> => {
        let snippet = '';

        if (match.sourceType === 'note') {
          const noteRows = await db.collections.user_notes.findByIndex('id', match.sourceId);
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

        if (!snippet) return null;

        const label = match.sourceType === 'note'
          ? '笔记参考'
          : (match.sourceType === 'utterance' ? '句段参考' : '文档参考');
        const contextTag = match.sourceType === 'note'
          ? 'NOTE_CONTEXT'
          : (match.sourceType === 'utterance' ? 'UTTERANCE_CONTEXT' : 'PDF_CONTEXT');
        const safeSnippet = snippet.slice(0, 300).replace(/[\[\]]/g, (char) => (char === '[' ? '【' : '】'));
        const validCitationTypes: Array<'note' | 'utterance' | 'pdf' | 'schema'> = ['note', 'utterance', 'pdf', 'schema'];
        if (!validCitationTypes.includes(match.sourceType as typeof validCitationTypes[number])) return null;

        return {
          contextTag,
          safeSnippet,
          citation: {
            type: match.sourceType as 'note' | 'utterance' | 'pdf' | 'schema',
            refId: match.sourceId,
            label,
            snippet: snippet.slice(0, 300),
          },
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
      const key = `${source.citation.type}:${source.citation.refId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (dedupedSources.length === 0) {
      return { contextBlock, citations: [] };
    }

    const ragLines = dedupedSources.map(
      (source, index) => `[${index + 1}] (${source.contextTag}) ${source.safeSnippet}`,
    );
    return {
      contextBlock: `${contextBlock}\n[RELEVANT_CONTEXT]\n${ragLines.join('\n')}\n${RAG_CITATION_INSTRUCTION}`,
      citations: dedupedSources.map((source) => source.citation),
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
    return { contextBlock, citations: [] };
  }
}
