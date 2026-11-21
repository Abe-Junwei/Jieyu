import { useEffect, useRef, useState } from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { formatMsSpan, msToSec, secToMs } from '../utils/timeMs';
import { DesktopScopeNote } from './DesktopScopeNote';

export interface DesktopProjectReadManuscript {
  id: string;
  title: Record<string, string>;
}

export interface DesktopProjectReadUnit {
  id: string;
  layerId?: string;
  textId?: string | null;
  startMs: number | null;
  endMs: number | null;
  text: string;
}

export function DesktopProjectReadView(props: {
  manuscripts: readonly DesktopProjectReadManuscript[];
  manuscriptId: string | null;
  units: readonly DesktopProjectReadUnit[];
  notes: readonly { id: string; unitId: string | null; text: string }[];
  audioUrl: string | null;
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
  noteLabel: string;
  saveNoteLabel: string;
  saveTimelineNoteLabel: string;
  saveWaveformNoteLabel: string;
  onSelectManuscript: (id: string) => void;
  draft: { unitId: string; text: string } | null;
  onEditText: (unitId: string, text: string, savedText: string) => void;
  onUnitText?: (unitId: string, savedText: string) => void;
  /** Fired when the visible selection changes, including deep-link focus. */
  onSelectUnit?: (unitId: string) => void;
  onComposeText: (composing: boolean) => void;
  onSaveText: () => void;
  /** Runs `go` once any unsaved text draft is saved or discarded. */
  onLeaveUnit: (go: () => void) => void;
  onUndoText: () => void;
  onSplit: (unitId: string, time: number) => void;
  onMerge: (keepId: string, removeId: string) => void;
  onMoveBoundary: (leftId: string, rightId: string, time: number) => void;
  onSaveNote: (unitId: string, text: string) => void | Promise<void>;
  onSaveTierNote: (
    unitId: string,
    view: 'timeline' | 'waveform',
    text: string,
  ) => void | Promise<void>;
  noteSessionId?: string | null;
  noteDesktopCall?: DesktopReadHost['desktopCall'];
  textNoteLabel?: string;
  saveTextNoteLabel?: string;
  focusUnitId?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const boundaryRef = useRef<HTMLInputElement>(null);
  const splitRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const onUnitText = useRef(props.onUnitText);
  onUnitText.current = props.onUnitText;
  const onSelectUnit = useRef(props.onSelectUnit);
  onSelectUnit.current = props.onSelectUnit;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const selected = props.units.find((unit) => unit.id === selectedId) ?? null;
  const publishSelection = (unitId: string) => {
    setSelectedId(unitId);
    onSelectUnit.current?.(unitId);
  };
  const focusUnit = (unit: DesktopProjectReadUnit) => {
    const go = () => {
      publishSelection(unit.id);
      const audio = audioRef.current;
      if (audio === null) return;
      const start = mediaStartSec(unit);
      if (start !== null) audio.currentTime = start;
    };
    if (unit.id === selectedId) go();
    else props.onLeaveUnit(go);
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
    publishSelection(unit.id);
    const audio = audioRef.current;
    if (audio === null) return;
    audio.currentTime = mediaStartSec(unit) ?? audio.currentTime;
  }, [props.focusUnitId, props.units]);
  const selectedText = selected?.text;
  useEffect(() => {
    if (selectedId === null || selectedText === undefined) return;
    onUnitText.current?.(selectedId, selectedText);
  }, [selectedId, selectedText]);
  const readNoteText = () => noteRef.current?.value ?? '';
  const clearNoteText = () => {
    if (noteRef.current !== null) noteRef.current.value = '';
  };
  const next =
    selected === null
      ? null
      : (props.units.find((unit) => selected.endMs !== null && unit.startMs === selected.endMs) ??
        null);

  return (
    <div className="desktop-project-read">
      <div className="desktop-project-read-manuscripts">
        {props.manuscripts.map((manuscript) => (
          <button
            key={manuscript.id}
            type="button"
            aria-current={manuscript.id === props.manuscriptId ? 'true' : 'false'}
            onClick={() => props.onLeaveUnit(() => props.onSelectManuscript(manuscript.id))}
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
              {unitSpanLabel(unit)}
            </button>
          </div>
        ))}
      </div>
      {selected === null ? null : (
        <div className="desktop-project-read-units">
          <input
            key={selected.id}
            aria-label={props.textLabel}
            value={props.draft?.unitId === selected.id ? props.draft.text : selected.text}
            onChange={(event) => props.onEditText(selected.id, event.target.value, selected.text)}
            onCompositionStart={() => props.onComposeText(true)}
            onCompositionEnd={() => props.onComposeText(false)}
          />
          <button type="button" onClick={() => props.onSaveText()}>
            {props.saveTextLabel}
          </button>
          <button type="button" onClick={() => props.onUndoText()}>
            {props.undoTextLabel}
          </button>
          <input
            ref={splitRef}
            key={`split-${selected.id}`}
            aria-label={props.splitTimeLabel}
            defaultValue={String(spanMidSec(selected))}
          />
          <button
            type="button"
            onClick={() => {
              const time = Number(splitRef.current?.value);
              if (!Number.isFinite(time)) return;
              props.onSplit(selected.id, secToMs(time));
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
                defaultValue={selected.endMs === null ? '' : String(msToSec(selected.endMs))}
              />
              <button
                type="button"
                onClick={() => {
                  const time = Number(boundaryRef.current?.value);
                  if (!Number.isFinite(time)) return;
                  props.onMoveBoundary(selected.id, next.id, secToMs(time));
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
              void Promise.resolve(props.onSaveNote(selected.id, text)).then(
                () => {
                  clearNoteText();
                },
                () => {
                  // Keep the draft; the controller surfaces the error.
                },
              );
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
                  void Promise.resolve(props.onSaveTierNote(selected.id, 'timeline', text)).then(
                    () => {
                      clearNoteText();
                    },
                    () => {
                      // Keep the draft; the controller surfaces the error.
                    },
                  );
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
                  void Promise.resolve(props.onSaveTierNote(selected.id, 'waveform', text)).then(
                    () => {
                      clearNoteText();
                    },
                    () => {
                      // Keep the draft; the controller surfaces the error.
                    },
                  );
                }}
              >
                {props.saveWaveformNoteLabel}
              </button>
            </>
          )}
          {selected.textId == null ||
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
    </div>
  );
}

function mediaStartSec(unit: DesktopProjectReadUnit): number | null {
  return unit.startMs === null ? null : msToSec(unit.startMs);
}

function spanMidSec(unit: DesktopProjectReadUnit): number {
  if (unit.startMs === null || unit.endMs === null) return 0;
  return (msToSec(unit.startMs) + msToSec(unit.endMs)) / 2;
}

function unitSpanLabel(unit: DesktopProjectReadUnit): string {
  if (unit.startMs === null || unit.endMs === null) return unit.text;
  return `${formatMsSpan(unit.startMs, unit.endMs)} ${unit.text}`;
}

function manuscriptLabel(title: Record<string, string>, id: string): string {
  const candidates = [title.zh, title['zh-CN'], title.und, ...Object.values(title)];
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return id;
}
