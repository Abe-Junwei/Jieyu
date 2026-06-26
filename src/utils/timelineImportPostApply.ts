import type { TimelineImportMismatchNotice } from './timelineImportMismatch';

/** 用户于导入前确认不匹配后，导入完成应自动扩展到的 `logicalDurationSec` 目标（秒）。 */
export function resolvePostImportLogicalExpandTargetSec(
  notices: ReadonlyArray<TimelineImportMismatchNotice>,
): number | null {
  let target = 0;
  for (const notice of notices) {
    if (
      notice.kind === 'acoustic_longer_than_logical' ||
      notice.kind === 'document_span_longer_than_established'
    ) {
      target = Math.max(target, notice.incomingSec);
    }
  }
  return target > 0 ? target : null;
}
