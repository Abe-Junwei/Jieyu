/**
 * `.timeline-scroll` 滚动内容坐标系中，`.timeline-content` **内边距以内**（轨面 t=0、首行轨顶）的原点。
 * 与语段 `left: t * zoomPxPerSec` 及轨面纵向叠放对齐。
 */
function parseCssPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getTierTimelineInnerOriginScrollPx(container: HTMLElement): {
  x: number;
  y: number;
} {
  const tc = container.querySelector('.timeline-content');
  if (!(tc instanceof HTMLElement)) return { x: 0, y: 0 };
  const tierRect = container.getBoundingClientRect();
  const tcRect = tc.getBoundingClientRect();
  const cs = window.getComputedStyle(tc);
  const padL = parseCssPx(cs.paddingLeft);
  const padT = parseCssPx(cs.paddingTop);
  const bl = parseCssPx(cs.borderLeftWidth);
  const bt = parseCssPx(cs.borderTopWidth);
  return {
    x: tcRect.left + bl + padL - tierRect.left + container.scrollLeft,
    y: tcRect.top + bt + padT - tierRect.top + container.scrollTop,
  };
}

/** 仅横向：与 `getTierTimelineInnerOriginScrollPx(c).x` 相同。 */
export function getTierTimeAxisOriginScrollPx(container: HTMLElement): number {
  return getTierTimelineInnerOriginScrollPx(container).x;
}

/**
 * `.timeline-content` 内，**padding 框顶点**（绝对定位子 `inset:0` 的 (0,0) 一般在此）到**内容区**（语段 t=0 水平线、首行轨顶）的局部像素偏移。
 * 套索状态里 `left/top` 以内容/轨面为原点，而 `timeline-lasso-overlay` 的 SVG 与「含层标签槽的整段」同层，须加此偏移才能与光标重合。
 */
export function getTierTimelineContentPaddingToInnerOffsetPx(tc: HTMLElement): {
  x: number;
  y: number;
} {
  const s = window.getComputedStyle(tc);
  return {
    x: parseCssPx(s.borderLeftWidth) + parseCssPx(s.paddingLeft),
    y: parseCssPx(s.borderTopWidth) + parseCssPx(s.paddingTop),
  };
}
