/** tier 套索起点排除：注释格、标签、表单控件等（与 `useLasso` 行为一致）。 */
export function isTimelineTierLassoExcludedTarget(target: Element): boolean {
  return Boolean(
    target.closest('.timeline-annotation') ||
      target.closest('.timeline-annotation-input') ||
      target.closest('.timeline-text-item') ||
      target.closest('.timeline-lane-label') ||
      target.closest('.timeline-lane-resize-handle') ||
      target.closest('.timeline-paired-reading-view') ||
      target.closest('input, textarea, select, button, a, [role="button"]'),
  );
}

/**
 * 无导入可播媒体时：允许在 `timeline-annotation` / 文本行容器上起拖以新建语段，
 * 仍排除左栏标签、层分隔把手、多轨调整柄、成对读壳与表单控件。
 * | When no media URL: allow lasso to start on annotation / text track surfaces.
 */
export function isTimelineTierLassoExcludedTargetNoMediaTextCreate(target: Element): boolean {
  return Boolean(
    target.closest('.transcription-import-media-btn') ||
      target.closest('.timeline-annotation-resize-handle') ||
      target.closest('.timeline-annotation-body-move') ||
      target.closest('.timeline-lane-label') ||
      target.closest('.timeline-lane-resize-handle') ||
      target.closest('.timeline-paired-reading-view') ||
      target.closest('input, textarea, select, button, a, [role="button"]') ||
      target.closest('video, canvas, audio') ||
      target.closest('.time-ruler') ||
      target.closest('.waveform-area'),
  );
}
