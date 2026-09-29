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
 * 无媒体时仍可在轨面空白处拖出新语段。
 * 语段格子本身必须排除：按字数排开后，像素不再是时间，点格子不能再走套索。
 */
export function isTimelineTierLassoExcludedTargetNoMediaTextCreate(target: Element): boolean {
  return Boolean(
    target.closest('.transcription-import-media-btn') ||
    target.closest('.timeline-annotation') ||
    target.closest('.timeline-text-item') ||
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
