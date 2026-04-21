import type { ComponentProps } from 'react';
import { TimelineDraftEditorSurface } from './TimelineDraftEditorSurface';

/**
 * 时间轴 lane 内草稿格共享壳：在 `TimelineDraftEditorSurface` 之上统一
 * pointer / click / doubleClick 的 `stopPropagation`，避免拖选、套索与外层 lane 手势冲突。
 * G3：横向 `TimelineAnnotationItem` 与纵向对读等多处共用同一入口。
 *
 * `bubbleClick`：少数宿主（如侧栏译文行）依赖外层容器 `onClick` 做选中，需让 click 冒泡。
 */
export type TimelineLaneDraftEditorCellProps = ComponentProps<typeof TimelineDraftEditorSurface> & {
  bubbleClick?: boolean;
};

export function TimelineLaneDraftEditorCell(props: TimelineLaneDraftEditorCellProps) {
  const { onPointerDown, onClick, onDoubleClick, bubbleClick = false, ...rest } = props;
  return (
    <TimelineDraftEditorSurface
      {...rest}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown?.(e);
      }}
      onClick={(e) => {
        if (!bubbleClick) {
          e.stopPropagation();
        }
        onClick?.(e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(e);
      }}
    />
  );
}
