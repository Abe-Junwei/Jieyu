import {
  diffAiToolSnapshot,
  loadAiToolReplayBundle,
  serializeAiToolGoldenSnapshot,
  type AiToolGoldenSnapshot,
  type AiToolReplayBundle,
  type AiToolSnapshotDiff,
} from '../../ai/auditReplay';
import { createLogger } from '../../observability/logger';
import { buildSnapshotDownloadName } from './aiChatCardUtils';

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
  try {
    const bundle = await loadAiToolReplayBundle(requestId);
    if (!bundle) {
      return {
        bundle: null,
        errorMessage: isZh ? '\u672a\u627e\u5230\u5bf9\u5e94\u56de\u653e\u6570\u636e\u3002' : 'Replay bundle was not found.',
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
      errorMessage: error instanceof Error ? error.message : (isZh ? '\u8bfb\u53d6\u56de\u653e\u5931\u8d25\u3002' : 'Failed to load replay bundle.'),
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
  try {
    const bundle = selectedReplayBundle?.requestId === requestId
      ? selectedReplayBundle
      : await loadAiToolReplayBundle(requestId);
    if (!bundle) {
      return {
        bundle: null,
        errorMessage: isZh ? '\u5bfc\u51fa\u5931\u8d25\uff1a\u672a\u627e\u5230\u5bf9\u5e94\u56de\u653e\u6570\u636e\u3002' : 'Export failed: replay bundle was not found.',
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
      errorMessage: error instanceof Error ? error.message : (isZh ? '\u5bfc\u51fa\u5feb\u7167\u5931\u8d25\u3002' : 'Failed to export snapshot.'),
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
  try {
    const json = JSON.parse(rawText) as AiToolGoldenSnapshot;
    if (json?.schemaVersion !== 1 || typeof json?.requestId !== 'string') {
      return {
        snapshot: null,
        errorMessage: isZh ? '\u5feb\u7167\u683c\u5f0f\u65e0\u6548\uff0c\u8bf7\u5bfc\u5165\u6709\u6548\u7684 golden snapshot \u6587\u4ef6\u3002' : 'Invalid snapshot format. Please import a valid golden snapshot file.',
      };
    }
    return { snapshot: json, errorMessage: null };
  } catch (error) {
    log.warn('Failed to parse imported golden snapshot file', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      snapshot: null,
      errorMessage: isZh ? '\u5feb\u7167\u89e3\u6790\u5931\u8d25\uff0c\u6587\u4ef6\u683c\u5f0f\u6709\u8bef\u3002' : 'Failed to parse snapshot file.',
    };
  }
}
