import type { PointerEvent as ReactPointerEvent } from 'react';
import { IconTipButton } from '../components/ui/IconTip';

const MIN_LANE_HEIGHT = 28;

/** Drag the bottom edge of a lane. The height is written when the pointer goes up. */
export function DesktopTranscriptionLaneResize(props: {
  label: string;
  onCommit: (height: number) => void;
}) {
  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const lane = event.currentTarget.closest('.desktop-tx-lane');
    if (!(lane instanceof HTMLElement)) return;
    const startY = event.clientY;
    const start = lane.getBoundingClientRect().height;
    const paint = (clientY: number) => {
      const next = Math.max(MIN_LANE_HEIGHT, Math.round(start + clientY - startY));
      lane.style.setProperty('--lane-height', `${next}px`);
      return next;
    };
    const move = (pointer: PointerEvent) => {
      paint(pointer.clientY);
    };
    const up = (pointer: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      props.onCommit(paint(pointer.clientY));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <IconTipButton
      className="desktop-tx-lane-resize"
      label={props.label}
      onPointerDown={onPointerDown}
    />
  );
}
