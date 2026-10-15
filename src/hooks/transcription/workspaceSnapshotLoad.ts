import { t, type Locale } from '../../i18n';
import { createLogger } from '../../observability/logger';
import type { SaveState } from './transcriptionTypes';

const log = createLogger('workspaceSnapshotLoad');

/**
 * 工作台载入的提交结果。`void` 留给尚未返回该结果的测试替身。
 * Outcome of a workspace snapshot load. `void` stays for test doubles that do not report one.
 */
export type WorkspaceSnapshotLoadResult =
  | { committed: true }
  | { committed: false; reason: 'superseded' };

export type LoadTranscriptionSnapshot = (
  textId: string,
) => Promise<WorkspaceSnapshotLoadResult | void>;

export function snapshotLoadWasSuperseded(result: WorkspaceSnapshotLoadResult | void): boolean {
  return result !== undefined && result.committed === false;
}

/**
 * 写入已经返回后再载入工作台。载入失败只提示视图没跟上，重试只再载入一次；
 * 被更新的载入取代时什么也不报。
 */
export async function reloadAfterWrite(input: {
  reload: () => Promise<WorkspaceSnapshotLoadResult | void>;
  setSaveState: (state: SaveState) => void;
  locale: Locale;
  onReloaded: () => void;
}): Promise<void> {
  const publishStale = (): void => {
    input.setSaveState({
      kind: 'viewStale',
      message: t(input.locale, 'transcription.importExport.writtenViewStale'),
      actionLabel: t(input.locale, 'transcription.toast.segmentViewRetry'),
      onAction: () => {
        void input.reload().then(
          () => {
            input.setSaveState({ kind: 'idle' });
          },
          () => {
            publishStale();
          },
        );
      },
    });
  };
  let result: WorkspaceSnapshotLoadResult | void;
  try {
    result = await input.reload();
  } catch (error) {
    log.warn('Write returned but the workspace did not refresh', {
      error: error instanceof Error ? error.message : String(error),
    });
    publishStale();
    return;
  }
  if (!snapshotLoadWasSuperseded(result)) input.onReloaded();
}

export type LinguisticAnnotationLoadResult =
  | { applied: true }
  | { applied: false; reason: 'superseded' };
