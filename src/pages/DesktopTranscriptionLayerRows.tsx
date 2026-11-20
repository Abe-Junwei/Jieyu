import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { TimelineAnnotationItem } from '../components/TimelineAnnotationItem';
import type { Locale } from '../i18n';
import { DesktopTranscriptionCreatePreview } from './DesktopTranscriptionCreatePreview';
import type { TimedEdgeUnit } from './desktopTranscriptionEdge';
import { desktopSegmentFrame } from './desktopTranscriptionEdgeView';
import { textKey } from './desktopTranscriptionTextKey';
import type { DesktopPlaybackUnit } from './useDesktopTranscriptionMediaController';

export interface LayerRowLayer {
  id: string;
  name: Record<string, string>;
  sortOrder?: number;
  units: readonly { id: string; startMs: number | null; endMs: number | null; text: string }[];
}

/** A card in some layer row: `layerId` + the unit id that row lists. */
export interface LayerCardRef {
  layerId: string;
  unitId: string;
}

/**
 * The manuscript's other layers under the main row: one row each, by sort order. Cards of the
 * same time unit line up; text is that layer's own. Click selects, a second click edits, a drag
 * on the empty track creates there.
 */
export function DesktopTranscriptionLayerRows(props: {
  locale: Locale;
  layers: readonly LayerRowLayer[];
  mainLayerId: string | null;
  duration: number;
  zoomPxPerSec: number;
  scrollLeftPx: number;
  focus: LayerCardRef | null;
  editing: LayerCardRef | null;
  createLayerId: string | null;
  createFrame: CSSProperties | null;
  bodyDraft: { unitId: string; text: string } | null;
  onPick: (card: LayerCardRef, unit: DesktopPlaybackUnit) => void;
  onEditBody: (unitId: string, text: string, savedText: string) => void;
  onComposeBody: (composing: boolean) => void;
  onCommitBody: () => void;
  onStopEdit: () => void;
  onCreate: (
    event: ReactPointerEvent<HTMLElement>,
    layerId: string,
    units: readonly TimedEdgeUnit[],
  ) => void;
}) {
  const rows = props.layers
    .filter((layer) => layer.id !== props.mainLayerId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return rows.map((layer) => {
    const units = layer.units.flatMap((unit) =>
      unit.startMs === null || unit.endMs === null
        ? []
        : [
            {
              id: unit.id,
              startTime: unit.startMs / 1000,
              endTime: unit.endMs / 1000,
              text: unit.text,
            },
          ],
    );
    const timed = units.map((unit) => ({
      id: unit.id,
      startMs: Math.round(unit.startTime * 1000),
      endMs: Math.round(unit.endTime * 1000),
    }));
    return (
      <div key={layer.id} className="desktop-tx-lane" data-layer-id={layer.id}>
        <div className="desktop-tx-band-label">{layerLabel(layer.name, props.locale, '')}</div>
        <div
          className="desktop-tx-lane__body"
          ref={(body) => {
            if (body) body.scrollLeft = props.scrollLeftPx;
          }}
        >
          <div
            className="desktop-tx-lane__track"
            style={
              props.zoomPxPerSec > 0 ? { width: props.duration * props.zoomPxPerSec } : undefined
            }
            onPointerDown={(event) => props.onCreate(event, layer.id, timed)}
          >
            {units.map((unit, index) => {
              const frame = desktopSegmentFrame(
                unit,
                props.duration,
                index,
                units.length,
                props.zoomPxPerSec,
              );
              const key = textKey(layer.id, unit.id);
              const card = { layerId: layer.id, unitId: unit.id };
              const selected = sameCard(props.focus, card);
              return (
                <TimelineAnnotationItem
                  key={unit.id}
                  unitId={unit.id}
                  left={frame.left ?? 0}
                  width={frame.width ?? 0}
                  isSelected={selected}
                  isActive={selected && sameCard(props.editing, card)}
                  isCompact={false}
                  title={unit.text}
                  draft={props.bodyDraft?.unitId === key ? props.bodyDraft.text : unit.text}
                  onClick={() => props.onPick(card, unit)}
                  onContextMenu={ignore}
                  onDoubleClick={ignore}
                  onResizeStartPointerDown={ignore}
                  onResizeEndPointerDown={ignore}
                  onChange={(event) => props.onEditBody(key, event.target.value, unit.text)}
                  onCompositionStart={() => props.onComposeBody(true)}
                  onCompositionEnd={() => props.onComposeBody(false)}
                  onBlur={() => props.onCommitBody()}
                  onKeyDown={(event) =>
                    restoreBody(props.onEditBody, key, unit, event, props.onStopEdit)
                  }
                />
              );
            })}
            {props.createLayerId === layer.id && props.createFrame ? (
              <DesktopTranscriptionCreatePreview
                className="desktop-tx-create"
                style={props.createFrame}
                radius={4}
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  });
}

function ignore() {
  return undefined;
}

export function sameCard(a: LayerCardRef | null, b: LayerCardRef | null): boolean {
  return a !== null && b !== null && a.layerId === b.layerId && a.unitId === b.unitId;
}

export function restoreBody(
  onEditBody: (unitId: string, text: string, savedText: string) => void,
  key: string,
  unit: DesktopPlaybackUnit,
  event: KeyboardEvent<HTMLInputElement>,
  stop: () => void,
) {
  if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
  event.preventDefault();
  onEditBody(key, unit.text, unit.text);
  stop();
}

export function layerLabel(
  name: Record<string, string> | undefined,
  locale: string,
  fallback: string,
): string {
  if (name === undefined) return fallback;
  const preferred = locale.startsWith('zh') ? name.zh : name.en;
  const label = (preferred ?? name.zh ?? name.en ?? Object.values(name)[0] ?? '').trim();
  return label.length > 0 ? label : fallback;
}
