import { diffAiToolSnapshot, loadAiToolReplayBundle, serializeAiToolGoldenSnapshot, type AiToolGoldenSnapshot, type AiToolReplayBundle, type AiToolSnapshotDiff } from '../../ai/auditReplay';
import { createLogger } from '../../observability/logger';
import { buildSnapshotDownloadName } from './aiChatCardUtils';
import { getAiChatReplayUtilsMessages } from '../../i18n/messages';

const log = createLogger('AiChatReplayUtils');

export interface ReplayBundleOpenResult {
  bundle: AiToolReplayBundle | null;
  errorMessage: string | null;
  snapshotDiff: AiToolSnapshotDiff | null;
}

export async function openReplayBundleByRequestId(
  requestId: string,
  compareSnapshot: AiToolGoldenSnapshot | null,
  isZh: boolean,
): Promise<ReplayBundleOpenResult> {
  const messages = getAiChatReplayUtilsMessages(isZh);
  try {
    const bundle = await loadAiToolReplayBundle(requestId);
    if (!bundle) {
      return {
        bundle: null,
        errorMessage: messages.replayNotFound,
        snapshotDiff: null,
      };
    }

    return {
      bundle,
      errorMessage: null,
      snapshotDiff: compareSnapshot ? diffAiToolSnapshot(compareSnapshot, bundle) : null,
    };
  } catch (error) {
    return {
      bundle: null,
      errorMessage: error instanceof Error ? error.message : messages.replayLoadFailed,
      snapshotDiff: null,
    };
  }
}

export interface ExportReplaySnapshotResult {
  bundle: AiToolReplayBundle | null;
  errorMessage: string | null;
}

export async function exportReplayBundleSnapshot(
  requestId: string,
  selectedReplayBundle: AiToolReplayBundle | null,
  isZh: boolean,
): Promise<ExportReplaySnapshotResult> {
  const messages = getAiChatReplayUtilsMessages(isZh);
  try {
    const bundle = selectedReplayBundle?.requestId === requestId
      ? selectedReplayBundle
      : await loadAiToolReplayBundle(requestId);
    if (!bundle) {
      return {
        bundle: null,
        errorMessage: messages.exportReplayNotFound,
      };
    }

    if (typeof window !== 'undefined') {
      const payload = serializeAiToolGoldenSnapshot(bundle);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = buildSnapshotDownloadName(bundle.toolName, bundle.requestId);
      anchor.click();
      window.URL.revokeObjectURL(url);
    }

    return { bundle, errorMessage: null };
  } catch (error) {
    return {
      bundle: null,
      errorMessage: error instanceof Error ? error.message : messages.exportSnapshotFailed,
    };
  }
}

export interface ImportReplaySnapshotResult {
  snapshot: AiToolGoldenSnapshot | null;
  errorMessage: string | null;
}

export function parseImportedGoldenSnapshot(
  rawText: string,
  isZh: boolean,
): ImportReplaySnapshotResult {
  const messages = getAiChatReplayUtilsMessages(isZh);
  try {
    const json = JSON.parse(rawText) as AiToolGoldenSnapshot;
    if (json?.schemaVersion !== 1 || typeof json?.requestId !== 'string') {
      return {
        snapshot: null,
        errorMessage: messages.invalidSnapshotFormat,
      };
    }
    return { snapshot: json, errorMessage: null };
  } catch (error) {
    log.warn('Failed to parse imported golden snapshot file', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      snapshot: null,
      errorMessage: messages.parseSnapshotFailed,
    };
  }
}
