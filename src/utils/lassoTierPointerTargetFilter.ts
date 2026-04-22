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
