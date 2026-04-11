/**
 * useMediaImport - Media Import Hook
 * 提取自 TranscriptionPage.tsx 的媒体导入逻辑
 */

import { useCallback, useRef } from 'react';
import { LinguisticService } from '../services/LinguisticService';
import type { MediaItemDocType } from '../db';
import type { SaveState } from './transcriptionTypes';
import { reportActionError } from '../utils/actionErrorReporter';

interface UseMediaImportOptions {
  activeTextId: string | null;
  getActiveTextId: () => Promise<string | null>;
  addMediaItem: (item: MediaItemDocType) => void;
  setSaveState: (state: SaveState) => void;
  setActiveTextId: (id: string) => void;
  tf: (key: string, opts?: Record<string, unknown>) => string;
}

export function useMediaImport({
  activeTextId,
  getActiveTextId,
  addMediaItem,
  setSaveState,
  setActiveTextId,
  tf,
}: UseMediaImportOptions) {
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDirectMediaImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const isAudio = file.type.startsWith('audio/');
    const isVideo = file.type.startsWith('video/');
    if (!isAudio && !isVideo) {
      input.value = '';
      return;
    }

    try {
      // Get duration
      const media = document.createElement(isVideo ? 'video' : 'audio') as HTMLMediaElement;
      // 仅加载元数据，避免大文件预缓冲 | Only load metadata, skip buffering to prevent large-file OOM
      media.preload = 'metadata';
      const objectUrl = URL.createObjectURL(file);
      media.src = objectUrl;
      const duration = await new Promise<number>((resolve) => {
        media.addEventListener('loadedmetadata', () => {
          URL.revokeObjectURL(objectUrl);
          resolve(Number.isFinite(media.duration) ? media.duration : 0);
        });
        media.addEventListener('error', () => {
          URL.revokeObjectURL(objectUrl);
          resolve(0);
        });
      });

      // Import using the same logic as AudioImportDialog
      let textId = activeTextId ?? (await getActiveTextId());
      if (!textId) {
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const result = await LinguisticService.createProject({
          primaryTitle: baseName,
          englishFallbackTitle: baseName,
          primaryLanguageId: 'und',
        });
        textId = result.textId;
        setActiveTextId(textId);
      }
      // 直接用 File（File 是 Blob 子类），避免 arrayBuffer() 复制导致大文件 OOM | Use File directly (File extends Blob) to avoid OOM from arrayBuffer() copy on large files
      const blob: Blob = file.type ? file : new Blob([file], { type: file.type });
      const { mediaId } = await LinguisticService.importAudio({
        textId,
        audioBlob: blob,
        filename: file.name,
        duration,
      });
      addMediaItem({
        id: mediaId,
        textId,
        filename: file.name,
        duration,
        details: { audioBlob: blob },
        isOfflineCached: true,
        createdAt: new Date().toISOString(),
      } as MediaItemDocType);
      setSaveState({ kind: 'done', message: tf('transcription.action.audioImported', { filename: file.name }) });
    } catch (error) {
      reportActionError({
        actionLabel: tf('transcription.toolbar.importAudio'),
        error,
        conflictNames: ['TranscriptionPersistenceConflictError', 'RecoveryApplyConflictError'],
        conflictI18nKey: 'transcription.importExport.conflict',
        fallbackI18nKey: 'transcription.action.audioImportFailed',
        conflictMessage: tf('transcription.importExport.conflict'),
        fallbackMessage: tf('transcription.action.audioImportFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      input.value = '';
    }
  }, [activeTextId, getActiveTextId, addMediaItem, setSaveState, setActiveTextId, tf]);

  return {
    mediaFileInputRef,
    handleDirectMediaImport,
  };
}
