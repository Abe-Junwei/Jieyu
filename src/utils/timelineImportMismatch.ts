import { DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC } from './timelineExtentConstants';
import {
  hasEstablishedTimedUnits,
  isDefaultBlankTimelineLogical,
  maxTimedUnitEndSec,
} from './timelineLogicalDurationSync';

const MISMATCH_EPSILON_SEC = 0.05;

/** 导入前已确立的文献/语段轴跨度（秒）：无对齐语段时不沿用 metadata / 默认 fallback。 */
export function resolveEstablishedTimelineContentSpanSec(input: {
  logicalDurationSecFromMapping?: number;
  unitsOnCurrentMedia: ReadonlyArray<{ endTime?: number }>;
}): number {
  const maxEnd = maxTimedUnitEndSec(input.unitsOnCurrentMedia);
  const hasTimedUnits = hasEstablishedTimedUnits(input.unitsOnCurrentMedia);
  const logical = input.logicalDurationSecFromMapping;
  const hasLogical = typeof logical === 'number' && Number.isFinite(logical) && logical > 0;

  if (hasTimedUnits) {
    if (hasLogical) return Math.max(logical, maxEnd);
    return maxEnd;
  }

  // 无语段时：用户已确立的短文献轴（非默认 1800s 画布）仍参与导入前不匹配感知。
  if (hasLogical && !isDefaultBlankTimelineLogical(logical)) {
    return logical;
  }
  return 0;
}

/** 文献/语段轴跨度（秒），不含声学 anchor。与 `computeLogicalTimelineDurationForZoom` 无声学分支同源。 */
export function resolveTimelineAxisLogicalSpanSec(input: {
  logicalDurationSecFromMapping?: number;
  unitsOnCurrentMedia: ReadonlyArray<{ endTime?: number }>;
}): number {
  const maxEnd = maxTimedUnitEndSec(input.unitsOnCurrentMedia);
  const logical = input.logicalDurationSecFromMapping;
  if (typeof logical === 'number' && Number.isFinite(logical) && logical > 0) {
    const merged = Math.max(logical, maxEnd);
    return merged > 0 ? merged : DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC;
  }
  if (maxEnd > 0) return maxEnd;
  return DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC;
}

export type TimelineImportMismatchKind =
  | 'acoustic_longer_than_logical'
  | 'acoustic_shorter_than_segments'
  | 'document_span_longer_than_established'
  /** 占位轨首次绑定声学，且文献跨度大于导入文件：语段将按比例 remap。 */
  | 'first_acoustic_bind_will_remap_segments';

export type TimelineImportMismatchNotice = {
  kind: TimelineImportMismatchKind;
  /** 待导入侧时长/跨度（声学文件秒，或互操作文献跨度秒）。 */
  incomingSec: number;
  /** 项目已确立的文献/逻辑轴跨度（秒）。 */
  establishedSpanSec: number;
  maxUnitEndSec: number;
};

/** 占位轨晋升声学且将触发 `remapLayerUnitsForFirstAcousticImport` 的导入路径。 */
export function resolveAudioImportWillRemapOnFirstBind(input: {
  disposition: { kind: 'simple' } | { kind: 'choose' };
  importMode?: 'replace' | 'add';
}): boolean {
  if (input.disposition.kind === 'simple') return true;
  return false;
}

/**
 * 导入前时长不匹配感知：不阻止导入，仅汇总需用户知情的差异。
 */
export function assessTimelineImportMismatch(input: {
  importAcousticSec: number;
  logicalDurationSecFromMapping?: number;
  unitsOnCurrentMedia: ReadonlyArray<{ endTime?: number }>;
  /** 占位轨首次绑定真实媒体（`importAudio` promote 路径）时为 true。 */
  willRemapOnFirstAcousticBind?: boolean;
}): TimelineImportMismatchNotice[] {
  const acoustic = input.importAcousticSec;
  if (!(typeof acoustic === 'number' && Number.isFinite(acoustic) && acoustic > 0)) {
    return [];
  }
  const establishedSpan = resolveEstablishedTimelineContentSpanSec({
    unitsOnCurrentMedia: input.unitsOnCurrentMedia,
    ...(typeof input.logicalDurationSecFromMapping === 'number'
      ? { logicalDurationSecFromMapping: input.logicalDurationSecFromMapping }
      : {}),
  });
  if (establishedSpan <= 0) return [];

  const maxEnd = maxTimedUnitEndSec(input.unitsOnCurrentMedia);

  const notices: TimelineImportMismatchNotice[] = [];
  const willRemap = input.willRemapOnFirstAcousticBind === true;
  if (willRemap && maxEnd > acoustic + MISMATCH_EPSILON_SEC) {
    notices.push({
      kind: 'first_acoustic_bind_will_remap_segments',
      incomingSec: acoustic,
      establishedSpanSec: establishedSpan,
      maxUnitEndSec: maxEnd,
    });
  } else if (!willRemap && maxEnd > acoustic + MISMATCH_EPSILON_SEC) {
    notices.push({
      kind: 'acoustic_shorter_than_segments',
      incomingSec: acoustic,
      establishedSpanSec: establishedSpan,
      maxUnitEndSec: maxEnd,
    });
  }
  if (acoustic > establishedSpan + MISMATCH_EPSILON_SEC) {
    notices.push({
      kind: 'acoustic_longer_than_logical',
      incomingSec: acoustic,
      establishedSpanSec: establishedSpan,
      maxUnitEndSec: maxEnd,
    });
  }
  return notices;
}

/**
 * 互操作文本导入前：待导入文献跨度 vs 项目已确立跨度 / 声学可播时长。
 */
export function assessAnnotationImportMismatch(input: {
  establishedDocumentSpanSec: number;
  establishedAcousticSec: number;
  importedLogicalDurationSec?: number;
  importedUnitsMaxEndSec: number;
}): TimelineImportMismatchNotice[] {
  const incomingSpan = Math.max(
    typeof input.importedLogicalDurationSec === 'number' &&
      Number.isFinite(input.importedLogicalDurationSec) &&
      input.importedLogicalDurationSec > 0
      ? input.importedLogicalDurationSec
      : 0,
    input.importedUnitsMaxEndSec,
  );
  if (!(incomingSpan > 0)) return [];

  const notices: TimelineImportMismatchNotice[] = [];
  const establishedDoc = input.establishedDocumentSpanSec;
  if (establishedDoc > 0 && incomingSpan > establishedDoc + MISMATCH_EPSILON_SEC) {
    notices.push({
      kind: 'document_span_longer_than_established',
      incomingSec: incomingSpan,
      establishedSpanSec: establishedDoc,
      maxUnitEndSec: input.importedUnitsMaxEndSec,
    });
  }
  const acoustic = input.establishedAcousticSec;
  if (acoustic > 0 && input.importedUnitsMaxEndSec > acoustic + MISMATCH_EPSILON_SEC) {
    notices.push({
      kind: 'acoustic_shorter_than_segments',
      incomingSec: acoustic,
      establishedSpanSec: establishedDoc > 0 ? establishedDoc : incomingSpan,
      maxUnitEndSec: input.importedUnitsMaxEndSec,
    });
  }
  return notices;
}
