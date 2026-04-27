import type { LayerDocType, UserNoteDocType } from '../types/jieyuDbDocTypes';
import { db as appDb } from '../app/jieyuDbPageAccess';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import { normalizeLocale, t, tf } from '../i18n';
import { extractUnitIdFromNote, getPdfPageFromHash, isDirectPdfCitationRef, splitPdfCitationRef } from '../utils/citationJumpUtils';
import { normalizeCitationSnippetPlainText } from '../utils/citationFootnoteUtils';

type CitationType = 'unit' | 'note' | 'pdf' | 'schema';

interface CitationRefLike {
  snippet?: string;
}

interface PdfPreviewRequestInput {
  title: string;
  page: number | null;
  sourceUrl?: string;
  sourceBlob?: Blob;
  hashSuffix?: string;
  searchSnippet?: string;
}

interface HandleTranscriptionCitationJumpOptions {
  locale: string;
  citationType: CitationType;
  refId: string;
  citationRef?: CitationRefLike;
  sidePaneRows: LayerDocType[];
  activeTimelineUnitId: string | null;
  onJumpToEmbeddingMatch: (unitId: string) => void;
  onSetNotePopover: (popover: NotePopoverState) => void;
  onSetSidebarError: (message: string) => void;
  onRevealSchemaLayer: (layerId: string) => void;
  onOpenPdfPreviewRequest: (input: PdfPreviewRequestInput) => void;
}

interface MediaLinkResolution {
  sourceUrl?: string;
  sourceBlob?: Blob;
}

function buildNotePopover(note: UserNoteDocType, fallbackUnitId: string | null): NotePopoverState {
  const unitId = extractUnitIdFromNote(note);
  return {
    x: Math.max(40, window.innerWidth - 360),
    y: 100,
    uttId: unitId ?? fallbackUnitId ?? '',
    noteTarget: {
      targetType: note.targetType,
      targetId: note.targetId,
      ...(note.parentTargetId ? { parentTargetId: note.parentTargetId } : {}),
      ...(typeof note.targetIndex === 'number' ? { targetIndex: note.targetIndex } : {}),
    },
  };
}

function resolveMediaLink(
  media: { url?: string; details?: Record<string, unknown> } | undefined,
): MediaLinkResolution | null {
  if (!media) return null;
  if (typeof media.url === 'string' && media.url.trim()) return { sourceUrl: media.url };
  const details = media.details;
  if (!details) return null;
  const detailUrl = details.url;
  if (typeof detailUrl === 'string' && detailUrl.trim()) return { sourceUrl: detailUrl };
  const pdfBlob = details.pdfBlob;
  if (pdfBlob instanceof Blob) {
    return { sourceBlob: pdfBlob };
  }
  return null;
}

export async function handleTranscriptionCitationJump({
  locale,
  citationType,
  refId,
  citationRef,
  sidePaneRows,
  activeTimelineUnitId,
  onJumpToEmbeddingMatch,
  onSetNotePopover,
  onSetSidebarError,
  onRevealSchemaLayer,
  onOpenPdfPreviewRequest,
}: HandleTranscriptionCitationJumpOptions): Promise<void> {
  const uiLocale = normalizeLocale(locale) ?? 'zh-CN';

  if (!refId) return;

  if (citationType === 'unit') {
    onJumpToEmbeddingMatch(refId);
    return;
  }

  if (citationType === 'note') {
    // 分块笔记 refId 可能带 #chunk=N 后缀，需取 base ID 查库 | Chunked note refId may have #chunk=N suffix, strip for DB lookup
    const noteBaseId = refId.includes('#') ? refId.slice(0, refId.indexOf('#')) : refId;
    const note = await appDb.user_notes.get(noteBaseId);
    if (!note) {
      onSetSidebarError(t(uiLocale, 'transcription.citation.noteNotFound'));
      return;
    }

    const unitId = extractUnitIdFromNote(note);
    if (unitId) {
      onJumpToEmbeddingMatch(unitId);
    }
    onSetNotePopover(buildNotePopover(note, activeTimelineUnitId));
    return;
  }

  if (citationType === 'schema') {
    const targetLayer = sidePaneRows.find((item) => item.id === refId || item.key === refId);
    if (!targetLayer) {
      onSetSidebarError(t(uiLocale, 'transcription.citation.schemaNotFound'));
      return;
    }

    onRevealSchemaLayer(targetLayer.id);
    return;
  }

  if (citationType === 'pdf') {
    const { baseRef, hashSuffix } = splitPdfCitationRef(refId);
    const page = getPdfPageFromHash(hashSuffix);
    const displayTitle = baseRef.split('/').pop() || baseRef || 'PDF';

    if (isDirectPdfCitationRef(refId)) {
      const snippet = normalizeCitationSnippetPlainText(citationRef?.snippet ?? '');
      onOpenPdfPreviewRequest({
        title: displayTitle,
        page,
        sourceUrl: baseRef || refId.trim(),
        ...(hashSuffix ? { hashSuffix } : {}),
        ...(snippet ? { searchSnippet: snippet } : {}),
      });
      return;
    }

    let media = await appDb.media_items.get(baseRef);
    if (!media) {
      const allMedia = await appDb.media_items.toArray();
      media = allMedia.find((item) => {
        const details = item.details as Record<string, unknown> | undefined;
        const mime = typeof details?.mimeType === 'string' ? details.mimeType.toLowerCase() : '';
        const isPdf = item.filename.toLowerCase().endsWith('.pdf') || mime.includes('pdf');
        if (!isPdf) return false;
        return item.filename === baseRef || item.id === baseRef;
      });
    }

    const mediaLink = resolveMediaLink(media);
    if (mediaLink) {
      const snippet = normalizeCitationSnippetPlainText(citationRef?.snippet ?? '');
      onOpenPdfPreviewRequest({
        title: media?.filename || displayTitle,
        page,
        ...(mediaLink.sourceUrl ? { sourceUrl: mediaLink.sourceUrl } : {}),
        ...(mediaLink.sourceBlob ? { sourceBlob: mediaLink.sourceBlob } : {}),
        ...(hashSuffix ? { hashSuffix } : {}),
        ...(snippet ? { searchSnippet: snippet } : {}),
      });
      return;
    }

    let source = await appDb.bibliographic_sources.get(baseRef);
    if (!source && baseRef !== refId) {
      source = await appDb.bibliographic_sources.get(refId);
    }
    if (!source) {
      const allSources = await appDb.bibliographic_sources.toArray();
      source = allSources.find((item) => item.citationKey === baseRef || item.citationKey === refId || item.id === refId);
    }
    const sourceUrl = source?.url?.trim();
    if (source && sourceUrl) {
      const snippet = normalizeCitationSnippetPlainText(citationRef?.snippet ?? '');
      onOpenPdfPreviewRequest({
        title: source.title || source.citationKey || displayTitle,
        page,
        sourceUrl,
        ...(hashSuffix ? { hashSuffix } : {}),
        ...(snippet ? { searchSnippet: snippet } : {}),
      });
      return;
    }

    let note = await appDb.user_notes.get(refId);
    if (!note) {
      note = (await appDb.user_notes.toArray()).find((item) => item.targetId === refId || item.targetId === baseRef);
    }

    if (note) {
      const unitId = extractUnitIdFromNote(note);
      if (unitId) {
        onJumpToEmbeddingMatch(unitId);
      }
      onSetNotePopover(buildNotePopover(note, activeTimelineUnitId));
      return;
    }

    onSetSidebarError(
      t(uiLocale, 'transcription.citation.pdfTargetNotFound'),
    );
    return;
  }

  onSetSidebarError(tf(uiLocale, 'transcription.citation.unsupportedType', { type: citationType }));
}