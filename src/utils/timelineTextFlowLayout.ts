import {
  TIMELINE_SEGMENT_TEXT_CHROME_PX,
  estimateTimelineSegmentTextWidthPx,
} from './timelineContentFitZoom';

export const TIMELINE_TEXT_FLOW_GAP_PX = 4;

const MIN_CELL_PX = 36;

export type TextFlowBox = {
  left: number;
  width: number;
};

export type TextFlowItem = {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  /** CSS font used to measure `text`. Omitted uses the timeline body default. */
  font?: string;
};

type Slot = {
  start: number;
  end: number;
  key: string;
};

type Column = Slot & {
  width: number;
  left: number;
};

export function textFlowFrameKey(layerId: string, unitId: string): string {
  return `${layerId}\n${unitId}`;
}

function quantizeMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

function slotKey(start: number, end: number): string {
  return `${quantizeMs(start)}:${quantizeMs(end)}`;
}

let measureCanvas: HTMLCanvasElement | null = null;

export function readTimelineAnnotationFont(): string {
  if (typeof document === 'undefined') return '12px sans-serif';
  const sample = document.querySelector('.timeline-annotation');
  if (!(sample instanceof HTMLElement)) return '12px sans-serif';
  const style = window.getComputedStyle(sample);
  const font =
    `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`.trim();
  return font.length > 0 ? font : '12px sans-serif';
}

export function layerTextFont(
  layer: {
    displaySettings?: { fontFamily?: string; fontSize?: number; bold?: boolean; italic?: boolean };
  },
  fallback: string,
): string {
  const settings = layer.displaySettings;
  if (settings === undefined) return fallback;
  const requestedFamily = settings.fontFamily?.trim() ?? '';
  const requestedSize = settings.fontSize;
  const hasSize = typeof requestedSize === 'number' && requestedSize > 0;
  const bold = settings.bold === true;
  const italic = settings.italic === true;
  if (requestedFamily.length === 0 && !hasSize && !bold && !italic) return fallback;
  const style = italic ? 'italic' : 'normal';
  const weight = bold ? '700' : '400';
  const size = hasSize ? requestedSize : 12;
  const family = requestedFamily.length > 0 ? requestedFamily : 'sans-serif';
  return `${style} ${weight} ${size}px ${family}`;
}

/** Pixel width of the text plus the segment chrome. Uses the live font when a canvas exists. */
export function measureTimelineTextWidthPx(text: string, font?: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  const fallback = estimateTimelineSegmentTextWidthPx(trimmed);
  if (typeof document === 'undefined') return fallback;
  measureCanvas ??= document.createElement('canvas');
  const context = measureCanvas.getContext('2d');
  if (!context) return fallback;
  const trimmedFont = font?.trim() ?? '';
  context.font = trimmedFont.length > 0 ? trimmedFont : '12px sans-serif';
  const measured = context.measureText(trimmed).width;
  if (!(measured > 0)) return fallback;
  return TIMELINE_SEGMENT_TEXT_CHROME_PX + measured;
}

function strictlyContains(outer: Slot, inner: Slot): boolean {
  const outerSpan = quantizeMs(outer.end) - quantizeMs(outer.start);
  const innerSpan = quantizeMs(inner.end) - quantizeMs(inner.start);
  if (!(innerSpan < outerSpan)) return false;
  return (
    quantizeMs(inner.start) >= quantizeMs(outer.start) &&
    quantizeMs(inner.end) <= quantizeMs(outer.end)
  );
}

function packColumns(columns: Column[]): number {
  let cursor = 0;
  for (const column of columns) {
    column.left = cursor;
    cursor += column.width + TIMELINE_TEXT_FLOW_GAP_PX;
  }
  return columns.length === 0 ? 0 : cursor - TIMELINE_TEXT_FLOW_GAP_PX;
}

function columnsCoveredBy(columns: readonly Column[], slot: Slot): Column[] {
  return columns.filter(
    (column) =>
      quantizeMs(column.start) >= quantizeMs(slot.start) &&
      quantizeMs(column.end) <= quantizeMs(slot.end),
  );
}

function spanBox(covered: readonly Column[], slot: Slot): TextFlowBox | null {
  const first = covered[0];
  const last = covered[covered.length - 1];
  if (!first || !last) return null;
  if (quantizeMs(first.start) !== quantizeMs(slot.start)) return null;
  if (quantizeMs(last.end) !== quantizeMs(slot.end)) return null;
  return { left: first.left, width: last.left + last.width - first.left };
}

/**
 * One column per shared time slot. Every layer in that slot gets the same
 * left and width, and the width is the widest text in the slot.
 * A cell that exactly covers several columns spans their outer edges.
 */
export function layoutTextFlowDocument(
  lanes: ReadonlyArray<{ layerId: string; items: ReadonlyArray<TextFlowItem> }>,
  measureText: (text: string, font?: string) => number = measureTimelineTextWidthPx,
): { frames: Map<string, TextFlowBox>; contentWidthPx: number } {
  const widthOf = (text: string, font?: string) => Math.max(measureText(text, font), MIN_CELL_PX);
  const frames = new Map<string, TextFlowBox>();
  const placed: Array<{ layerId: string; item: TextFlowItem }> = [];
  const slots = new Map<string, Slot>();

  for (const lane of lanes) {
    for (const item of lane.items) {
      const start = Number.isFinite(item.startTime) ? item.startTime : 0;
      const end = Number.isFinite(item.endTime) && item.endTime > start ? item.endTime : start;
      const normalized = { ...item, startTime: start, endTime: end };
      placed.push({ layerId: lane.layerId, item: normalized });
      const key = slotKey(start, end);
      if (!slots.has(key)) slots.set(key, { start, end, key });
    }
  }

  const allSlots = [...slots.values()];
  const atomicSlots = allSlots.filter(
    (slot) => !allSlots.some((other) => strictlyContains(slot, other)),
  );
  const columns: Column[] = atomicSlots
    .sort((left, right) => {
      const startDelta = quantizeMs(left.start) - quantizeMs(right.start);
      if (startDelta !== 0) return startDelta;
      return quantizeMs(left.end) - quantizeMs(right.end);
    })
    .map((slot) => ({ ...slot, width: MIN_CELL_PX, left: 0 }));
  const columnByKey = new Map(columns.map((column) => [column.key, column]));

  for (const { item } of placed) {
    const column = columnByKey.get(slotKey(item.startTime, item.endTime));
    if (!column) continue;
    column.width = Math.max(column.width, widthOf(item.text, item.font));
  }

  packColumns(columns);

  for (const { item } of placed) {
    if (columnByKey.has(slotKey(item.startTime, item.endTime))) continue;
    const covered = columnsCoveredBy(columns, {
      start: item.startTime,
      end: item.endTime,
      key: slotKey(item.startTime, item.endTime),
    });
    const box = spanBox(covered, {
      start: item.startTime,
      end: item.endTime,
      key: slotKey(item.startTime, item.endTime),
    });
    if (!box) continue;
    const needed = widthOf(item.text, item.font);
    if (needed <= box.width) continue;
    const last = covered[covered.length - 1];
    if (!last) continue;
    last.width += needed - box.width;
  }

  const contentWidthPx = packColumns(columns);

  for (const { layerId, item } of placed) {
    const column = columnByKey.get(slotKey(item.startTime, item.endTime));
    const box = column
      ? { left: column.left, width: column.width }
      : spanBox(
          columnsCoveredBy(columns, {
            start: item.startTime,
            end: item.endTime,
            key: slotKey(item.startTime, item.endTime),
          }),
          { start: item.startTime, end: item.endTime, key: slotKey(item.startTime, item.endTime) },
        );
    if (!box) continue;
    frames.set(textFlowFrameKey(layerId, item.id), box);
  }

  return { frames, contentWidthPx };
}
