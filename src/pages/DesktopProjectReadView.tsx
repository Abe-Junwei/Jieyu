import { useEffect, useRef, useState } from 'react';
import {
  previewTextTimeMapping,
  type TextTimeMapping,
} from '../services/LinguisticService.timeMapping';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { DesktopScopeNote } from './DesktopScopeNote';

export interface DesktopProjectReadManuscript {
  id: string;
  title: Record<string, string>;
}

export interface DesktopProjectReadUnit {
  id: string;
  layerId?: string;
  textId?: string;
  startTime: number;
  endTime: number;
  text: string;
}

export function DesktopProjectReadView(props: {
  manuscripts: readonly DesktopProjectReadManuscript[];
  manuscriptId: string | null;
  units: readonly DesktopProjectReadUnit[];
  notes: readonly { id: string; unitId: string | null; text: string }[];
  audioUrl: string | null;
  timeMapping: TextTimeMapping | null;
  emptyLabel: string;
  audioLabel: string;
  textLabel: string;
  saveTextLabel: string;
  undoTextLabel: string;
  splitLabel: string;
  splitTimeLabel: string;
  mergeNextLabel: string;
  boundaryLabel: string;
  moveBoundaryLabel: string;
  offsetLabel: string;
  scaleLabel: string;
  saveMappingLabel: string;
  noteLabel: string;
  saveNoteLabel: string;
  saveTimelineNoteLabel: string;
  saveWaveformNoteLabel: string;
  onSelectManuscript: (id: string) => void;
  onSaveText: (unitId: string, text: string) => void;
  onUndoText: () => void;
  onSplit: (unitId: string, time: number) => void;
  onMerge: (keepId: string, removeId: string) => void;
  onMoveBoundary: (leftId: string, rightId: string, time: number) => void;
  onSaveMapping: (offsetSec: number, scale: number) => void;
  onSaveNote: (unitId: string, text: string) => void;
  onSaveTierNote: (unitId: string, view: 'timeline' | 'waveform', text: string) => void;
  noteSessionId?: string | null;
  noteDesktopCall?: DesktopReadHost['desktopCall'];
  textNoteLabel?: string;
  saveTextNoteLabel?: string;
  focusUnitId?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const boundaryRef = useRef<HTMLInputElement>(null);
  const splitRef = useRef<HTMLInputElement>(null);
  const offsetRef = useRef<HTMLInputElement>(null);
  const scaleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const selected = props.units.find((unit) => unit.id === selectedId) ?? null;
  const focusUnit = (unit: DesktopProjectReadUnit) => {
    setSelectedId(unit.id);
    const audio = audioRef.current;
    if (audio === null) return;
    audio.currentTime = playerStart(unit, props.timeMapping);
  };
  useEffect(() => {
    pendingFocus.current = props.focusUnitId ?? null;
  }, [props.focusUnitId]);
  useEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    const unit = props.units.find((item) => item.id === id);
    if (unit === undefined) return;
    pendingFocus.current = null;
    setSelectedId(unit.id);
    const audio = audioRef.current;
    if (audio === null) return;
    audio.currentTime = playerStart(unit, props.timeMapping);
  }, [props.focusUnitId, props.units, props.timeMapping]);
  const readNoteText = () => noteRef.current?.value ?? '';
  const clearNoteText = () => {
    if (noteRef.current !== null) noteRef.current.value = '';
  };
  const next =
    selected === null
      ? null
      : (props.units.find((unit) => unit.startTime === selected.endTime) ?? null);

  return (
    <div className="desktop-project-read">
      <div className="desktop-project-read-manuscripts">
        {props.manuscripts.map((manuscript) => (
          <button
            key={manuscript.id}
            type="button"
            aria-current={manuscript.id === props.manuscriptId ? 'true' : 'false'}
            onClick={() => props.onSelectManuscript(manuscript.id)}
          >
            {manuscriptLabel(manuscript.title, manuscript.id)}
          </button>
        ))}
      </div>
      {props.manuscripts.length === 0 ? <p>{props.emptyLabel}</p> : null}
      {props.audioUrl === null ? null : (
        <audio ref={audioRef} src={props.audioUrl} controls aria-label={props.audioLabel} />
      )}
      <div className="desktop-project-read-units">
        {props.units.map((unit) => (
          <div key={unit.id}>
            <button type="button" onClick={() => focusUnit(unit)}>
              {`${unit.startTime.toFixed(1)}–${unit.endTime.toFixed(1)} ${unit.text}`}
            </button>
            <span>{playerRange(unit, props.timeMapping)}</span>
          </div>
        ))}
      </div>
      {selected === null ? null : (
        <div className="desktop-project-read-units">
          <input
            ref={textRef}
            key={`${selected.id}:${selected.text}`}
            aria-label={props.textLabel}
            defaultValue={selected.text}
          />
          <button
            type="button"
            onClick={() => {
              const text = textRef.current?.value ?? '';
              if (text.length === 0) return;
              props.onSaveText(selected.id, text);
            }}
          >
            {props.saveTextLabel}
          </button>
          <button type="button" onClick={() => props.onUndoText()}>
            {props.undoTextLabel}
          </button>
          <input
            ref={splitRef}
            key={`split-${selected.id}`}
            aria-label={props.splitTimeLabel}
            defaultValue={String((selected.startTime + selected.endTime) / 2)}
          />
          <button
            type="button"
            onClick={() => {
              const time = Number(splitRef.current?.value);
              if (!Number.isFinite(time)) return;
              props.onSplit(selected.id, time);
            }}
          >
            {props.splitLabel}
          </button>
          {next === null ? null : (
            <button type="button" onClick={() => props.onMerge(selected.id, next.id)}>
              {props.mergeNextLabel}
            </button>
          )}
          {next === null ? null : (
            <>
              <input
                ref={boundaryRef}
                key={selected.id}
                aria-label={props.boundaryLabel}
                defaultValue={String(selected.endTime)}
              />
              <button
                type="button"
                onClick={() => {
                  const time = Number(boundaryRef.current?.value);
                  if (!Number.isFinite(time)) return;
                  props.onMoveBoundary(selected.id, next.id, time);
                }}
              >
                {props.moveBoundaryLabel}
              </button>
            </>
          )}
          <ul>
            {props.notes
              .filter((note) => note.unitId === selected.id)
              .map((note) => (
                <li key={note.id}>{note.text}</li>
              ))}
          </ul>
          <input ref={noteRef} key={`note-${selected.id}`} aria-label={props.noteLabel} />
          <button
            type="button"
            onClick={() => {
              const text = readNoteText();
              if (text.length === 0) return;
              props.onSaveNote(selected.id, text);
              clearNoteText();
            }}
          >
            {props.saveNoteLabel}
          </button>
          {selected.layerId === undefined ? null : (
            <>
              <button
                type="button"
                onClick={() => {
                  const text = readNoteText();
                  const layerId = selected.layerId;
                  if (text.length === 0 || layerId === undefined) return;
                  props.onSaveTierNote(selected.id, 'timeline', text);
                  clearNoteText();
                }}
              >
                {props.saveTimelineNoteLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  const text = readNoteText();
                  const layerId = selected.layerId;
                  if (text.length === 0 || layerId === undefined) return;
                  props.onSaveTierNote(selected.id, 'waveform', text);
                  clearNoteText();
                }}
              >
                {props.saveWaveformNoteLabel}
              </button>
            </>
          )}
          {selected.textId === undefined ||
          props.noteSessionId == null ||
          props.noteDesktopCall === undefined ||
          props.textNoteLabel === undefined ||
          props.saveTextNoteLabel === undefined ? null : (
            <DesktopScopeNote
              sessionId={props.noteSessionId}
              desktopCall={props.noteDesktopCall}
              scope={{ kind: 'unit_text', unitId: selected.id, unitTextId: selected.textId }}
              label={`${props.textNoteLabel}: ${selected.text}`}
              saveLabel={props.saveTextNoteLabel ?? ''}
            />
          )}
        </div>
      )}
      <div className="desktop-project-read-units">
        <input
          ref={offsetRef}
          key={`offset-${props.manuscriptId ?? ''}-${props.timeMapping?.revision ?? 0}`}
          aria-label={props.offsetLabel}
          defaultValue={String(props.timeMapping?.offsetSec ?? 0)}
        />
        <input
          ref={scaleRef}
          key={`scale-${props.manuscriptId ?? ''}-${props.timeMapping?.revision ?? 0}`}
          aria-label={props.scaleLabel}
          defaultValue={String(props.timeMapping?.scale ?? 1)}
        />
        <button
          type="button"
          onClick={() => {
            const offsetSec = Number(offsetRef.current?.value);
            const scale = Number(scaleRef.current?.value);
            if (!Number.isFinite(offsetSec) || !Number.isFinite(scale)) return;
            props.onSaveMapping(offsetSec, scale);
          }}
        >
          {props.saveMappingLabel}
        </button>
      </div>
    </div>
  );
}

function playerStart(unit: DesktopProjectReadUnit, mapping: TextTimeMapping | null): number {
  return previewTextTimeMapping({
    startTime: unit.startTime,
    endTime: unit.endTime,
    ...(mapping === null ? {} : { offsetSec: mapping.offsetSec, scale: mapping.scale }),
  }).realStartTime;
}

function playerRange(unit: DesktopProjectReadUnit, mapping: TextTimeMapping | null): string {
  const preview = previewTextTimeMapping({
    startTime: unit.startTime,
    endTime: unit.endTime,
    ...(mapping === null ? {} : { offsetSec: mapping.offsetSec, scale: mapping.scale }),
  });
  return `${preview.realStartTime.toFixed(1)}–${preview.realEndTime.toFixed(1)}`;
}

function manuscriptLabel(title: Record<string, string>, id: string): string {
  const candidates = [title.zh, title['zh-CN'], title.und, ...Object.values(title)];
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return id;
}
