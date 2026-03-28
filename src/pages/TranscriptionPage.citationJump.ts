import { db as appDb, type LayerDocType, type UserNoteDocType } from '../db';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import { extractUtteranceIdFromNote, getPdfPageFromHash, isDirectPdfCitationRef, splitPdfCitationRef } from '../utils/citationJumpUtils';

type CitationType = 'utterance' | 'note' | 'pdf' | 'schema';

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
  layerRailRows: LayerDocType[];
  selectedTimelineUtteranceId: string | null;
  onJumpToEmbeddingMatch: (utteranceId: string) => void;
  onSetNotePopover: (popover: NotePopoverState) => void;
  onSetSidebarError: (message: string) => void;
  onRevealSchemaLayer: (layerId: string) => void;
  onOpenPdfPreviewRequest: (input: PdfPreviewRequestInput) => void;
}

interface MediaLinkResolution {
  sourceUrl?: string;
  sourceBlob?: Blob;
}

function buildNotePopover(note: UserNoteDocType, fallbackUtteranceId: string | null): NotePopoverState {
  const utteranceId = extractUtteranceIdFromNote(note);
  return {
    x: Math.max(40, window.innerWidth - 360),
    y: 100,
    uttId: utteranceId ?? fallbackUtteranceId ?? '',
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
  layerRailRows,
  selectedTimelineUtteranceId,
  onJumpToEmbeddingMatch,
  onSetNotePopover,
  onSetSidebarError,
  onRevealSchemaLayer,
  onOpenPdfPreviewRequest,
}: HandleTranscriptionCitationJumpOptions): Promise<void> {
  if (!refId) return;

  if (citationType === 'utterance') {
    onJumpToEmbeddingMatch(refId);
    return;
  }

  if (citationType === 'note') {
    const note = await appDb.user_notes.get(refId);
    if (!note) {
      onSetSidebarError(locale === 'zh-CN' ? '未找到引用的笔记。' : 'Referenced note was not found.');
      return;
    }

    const utteranceId = extractUtteranceIdFromNote(note);
    if (utteranceId) {
      onJumpToEmbeddingMatch(utteranceId);
    }
    onSetNotePopover(buildNotePopover(note, selectedTimelineUtteranceId));
    return;
  }

  if (citationType === 'schema') {
    const targetLayer = layerRailRows.find((item) => item.id === refId || item.key === refId);
    if (!targetLayer) {
      onSetSidebarError(locale === 'zh-CN' ? '未找到引用的层定义。' : 'Referenced layer schema was not found.');
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
      const snippet = citationRef?.snippet?.trim();
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
      const snippet = citationRef?.snippet?.trim();
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

    let note = await appDb.user_notes.get(refId);
    if (!note) {
      note = (await appDb.user_notes.toArray()).find((item) => item.targetId === refId || item.targetId === baseRef);
    }

    if (note) {
      const utteranceId = extractUtteranceIdFromNote(note);
      if (utteranceId) {
        onJumpToEmbeddingMatch(utteranceId);
      }
      onSetNotePopover(buildNotePopover(note, selectedTimelineUtteranceId));
      return;
    }

    onSetSidebarError(locale === 'zh-CN' ? '未找到可打开的 PDF 引用目标。' : 'No openable PDF citation target was found.');
    return;
  }

  onSetSidebarError(locale === 'zh-CN'
    ? `当前暂不支持跳转到 ${citationType} 引用。`
    : `Jump for ${citationType} citation is not supported yet.`);
}