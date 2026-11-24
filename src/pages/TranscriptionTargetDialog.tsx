import { useEffect, useRef, useState } from 'react';
import { ModalPanel } from '../components/ui/ModalPanel';
import { t, useLocale } from '../i18n';
import { oralFailure } from './oralTake';

type Target = { id: string; name: Record<string, string>; tierType: string; host: boolean };
type TargetList = {
  manuscriptId: string;
  hostLayerId: string;
  contentType: 'transcription' | 'translation';
  targets: Target[];
};
type Choice = { id: string; startMs: number; endMs: number; longer: boolean };
type Plan =
  | { action: 'write'; longer: boolean; host: boolean; hasBody: boolean }
  | { action: 'choose'; units: Choice[] }
  | { action: 'create'; empty: boolean };

type Write = {
  targetLayerId: string;
  targetUnitId?: string;
  createUnit?: boolean;
  confirmHost?: boolean;
  confirmLonger?: boolean;
};

function layerLabel(name: Record<string, string>, locale: string): string {
  const preferred = locale.startsWith('zh') ? name.zh : name.en;
  return (preferred ?? name.zh ?? name.en ?? Object.values(name)[0] ?? '').trim();
}

function isList(value: unknown): value is TargetList {
  return (
    typeof value === 'object' &&
    value !== null &&
    'targets' in value &&
    Array.isArray((value as { targets: unknown }).targets)
  );
}

function isPlan(value: unknown): value is Plan {
  return typeof value === 'object' && value !== null && 'action' in value;
}

/** Picks the text layer for one recording, then confirms a longer segment or a new one. */
export function TranscriptionTargetDialog(props: {
  layerId: string;
  unitId: string;
  onClose: () => void;
  listTargets: (layerId: string) => Promise<unknown>;
  plan: (layerId: string, unitId: string, targetLayerId: string) => Promise<unknown>;
  createLayer: (manuscriptId: string, hostLayerId: string, name: string) => Promise<unknown>;
  transcribe: (layerId: string, unitId: string, target: Write) => Promise<void>;
}) {
  const locale = useLocale();
  const [list, setList] = useState<TargetList | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<'host' | 'longer' | 'create' | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const close = () => {
    request.current++;
    props.onClose();
  };
  useEffect(() => {
    request.current += 1;
  }, [props.layerId, props.unitId]);
  const listTargets = useRef(props.listTargets);
  listTargets.current = props.listTargets;

  useEffect(() => {
    let live = true;
    void listTargets.current(props.layerId).then(
      (value) => {
        if (live && isList(value)) setList(value);
      },
      (error: unknown) => {
        if (live) setNote(t(locale, oralFailure(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [locale, props.layerId]);

  const write = (target: Write) => {
    const current = ++request.current;
    setBusy(true);
    void props.transcribe(props.layerId, props.unitId, target).then(
      () => {
        if (current === request.current) close();
      },
      (error: unknown) => {
        if (current !== request.current) return;
        setBusy(false);
        setNote(t(locale, oralFailure(error)));
      },
    );
  };

  const pickLayer = (id: string, host: boolean) => {
    const current = ++request.current;
    setBusy(true);
    setNote(null);
    setPending(null);
    void props.plan(props.layerId, props.unitId, id).then(
      (value) => {
        if (current !== request.current) return;
        setBusy(false);
        if (!isPlan(value)) return;
        if (value.action === 'choose') {
          setTargetId(id);
          setChoices(value.units);
          return;
        }
        if (value.action === 'create') {
          if (value.empty) write({ targetLayerId: id, createUnit: true });
          else {
            setTargetId(id);
            setPending('create');
            setNote(t(locale, 'app.desktopTranscription.oralTargetCreate'));
          }
          return;
        }
        if (value.host && value.hasBody) {
          setTargetId(id);
          setPending('host');
          setNote(t(locale, 'app.desktopTranscription.oralTargetHost'));
          return;
        }
        if (value.longer) {
          setTargetId(id);
          setPending('longer');
          setNote(t(locale, 'app.desktopTranscription.oralTargetLonger'));
          return;
        }
        write({ targetLayerId: id, ...(host ? { confirmHost: true } : {}) });
      },
      (error: unknown) => {
        if (current !== request.current) return;
        setBusy(false);
        setNote(t(locale, oralFailure(error)));
      },
    );
  };

  const confirm = () => {
    if (targetId === null || pending === null) return;
    write({
      targetLayerId: targetId,
      ...(pending === 'host' ? { confirmHost: true } : {}),
      ...(pending === 'longer' ? { confirmLonger: true } : {}),
      ...(pending === 'create' ? { createUnit: true } : {}),
    });
  };

  const makeLayer = () => {
    if (list === null || name.trim().length === 0) return;
    const current = ++request.current;
    setBusy(true);
    void props.createLayer(list.manuscriptId, list.hostLayerId, name.trim()).then(
      (created) => {
        if (current !== request.current) return;
        const id =
          typeof created === 'object' && created !== null && 'id' in created
            ? String((created as { id: unknown }).id)
            : '';
        if (id.length === 0) {
          setBusy(false);
          return;
        }
        write({ targetLayerId: id });
      },
      (error: unknown) => {
        if (current !== request.current) return;
        setBusy(false);
        setNote(t(locale, oralFailure(error)));
      },
    );
  };

  const needsName =
    list !== null && list.contentType === 'translation' && list.targets.length === 0;
  return (
    <ModalPanel
      isOpen
      compact
      title={t(locale, 'app.desktopTranscription.oralTargetTitle')}
      onClose={close}
      footer={
        needsName ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={makeLayer}>
            {t(locale, 'app.desktopTranscription.oralTargetWrite')}
          </button>
        ) : note !== null && pending !== null && choices === null ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>
            {t(locale, 'app.desktopTranscription.oralTargetWrite')}
          </button>
        ) : null
      }
    >
      {needsName ? (
        <label>
          {t(locale, 'app.desktopTranscription.oralTargetLayer')}
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      ) : choices !== null && targetId !== null ? (
        <div>
          {choices.map((unit) => (
            <button
              key={unit.id}
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                write({
                  targetLayerId: targetId,
                  targetUnitId: unit.id,
                  ...(unit.longer ? { confirmLonger: true } : {}),
                })
              }
            >
              {unit.startMs}–{unit.endMs}
              {unit.longer ? ` ${t(locale, 'app.desktopTranscription.oralTargetLonger')}` : ''}
            </button>
          ))}
        </div>
      ) : (
        <div>
          {list?.targets.map((target) => (
            <button
              key={target.id}
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => pickLayer(target.id, target.host)}
            >
              {layerLabel(target.name, locale)}
              {target.host ? ` ${t(locale, 'app.desktopTranscription.oralTargetHost')}` : ''}
            </button>
          ))}
        </div>
      )}
      {note !== null && choices === null ? <p>{note}</p> : null}
    </ModalPanel>
  );
}
