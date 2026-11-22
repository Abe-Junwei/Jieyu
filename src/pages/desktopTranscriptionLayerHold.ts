/** Press-hold gate. The drag is not active until the timer ends without a cancel. */

const SLOP_PX = 6;

export function startLayerHold(
  event: {
    button: number;
    pointerId: number;
    clientX: number;
    clientY: number;
    currentTarget: EventTarget;
  },
  delay: number,
  onStart: (point: { x: number; y: number }) => void,
): () => void {
  if (event.button !== 0) return () => undefined;
  const el = event.currentTarget;
  const pointerId = event.pointerId;
  const origin = { x: event.clientX, y: event.clientY };
  let latest = origin;
  let timer: number | null = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', stop);
  };
  const move = (moveEvent: PointerEvent) => {
    latest = { x: moveEvent.clientX, y: moveEvent.clientY };
    const distance = Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y);
    if (distance > SLOP_PX) stop();
  };
  const onKey = (keyEvent: KeyboardEvent) => {
    if (keyEvent.key === 'Escape') stop();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', stop);
  timer = window.setTimeout(() => {
    timer = null;
    const point = latest;
    stop();
    if (el instanceof HTMLElement && typeof el.setPointerCapture === 'function') {
      try {
        el.setPointerCapture(pointerId);
      } catch (caught) {
        if (!(caught instanceof DOMException) || caught.name !== 'NotFoundError') throw caught;
      }
    }
    onStart(point);
  }, delay);
  return stop;
}
