export type EmptyTimelineReason = 'no_layers' | 'no_media' | 'no_units_with_wave';

export type EmptyTimelinePrimaryCta = 'create_layer' | 'import_file' | 'none';

/** 阶段 F：时间轴空壳策略（emptyReason + primaryCta）。 */
export type EmptyTimelinePolicy = {
  emptyReason: EmptyTimelineReason;
  primaryCta: EmptyTimelinePrimaryCta;
  /** 为 false 时不渲染空壳 chrome（当前媒体已有 unit）。 */
  showEmptyChrome: boolean;
};

export function buildEmptyTimelinePolicy(input: {
  layersCount: number;
  hasSelectedMedia: boolean;
  currentMediaUnitCount: number;
}): EmptyTimelinePolicy {
  if (input.currentMediaUnitCount > 0) {
    return {
      emptyReason: 'no_units_with_wave',
      primaryCta: 'none',
      showEmptyChrome: false,
    };
  }
  if (input.layersCount === 0) {
    return {
      emptyReason: 'no_layers',
      primaryCta: 'create_layer',
      showEmptyChrome: true,
    };
  }
  if (input.hasSelectedMedia) {
    return {
      emptyReason: 'no_units_with_wave',
      primaryCta: 'none',
      showEmptyChrome: true,
    };
  }
  return {
    emptyReason: 'no_media',
    primaryCta: 'import_file',
    showEmptyChrome: true,
  };
}
