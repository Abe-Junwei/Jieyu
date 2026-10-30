import { featureFlags } from '../ai/config/featureFlags';
import { DesktopModelCandidates } from './DesktopModelCandidates';
import { useEffect, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

interface TranscriptRow {
  text: string;
  start: string;
  end: string;
}

type AcceptProps = {
  sessionId: string;
  manuscriptId: string;
  desktopCall: DesktopReadHost['desktopCall'];
  onAccepted: () => void;
  host?: DesktopReadHost;
  layerId?: string | null;
};

export function DesktopTranscriptionAcceptPanel(props: AcceptProps) {
  if (
    featureFlags.desktopModelCandidatesEnabled &&
    props.host?.transcribeProject &&
    props.host.chooseTranscriptionModel &&
    props.host.cancelProjectTranscription &&
    props.layerId
  ) {
    return (
      <DesktopModelCandidates
        host={props.host}
        sessionId={props.sessionId}
        manuscriptId={props.manuscriptId}
        layerId={props.layerId}
        onAccepted={props.onAccepted}
      />
    );
  }
  return <ManualTranscriptionCandidates {...props} />;
}

function ManualTranscriptionCandidates(props: AcceptProps) {
  const locale = useLocale();
  const [rows, setRows] = useState<TranscriptRow[]>([{ text: '', start: '', end: '' }]);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const { sessionId, manuscriptId, desktopCall, onAccepted } = props;
  const textLabel = t(locale, 'app.desktopRead.acceptTranscriptText');
  const startLabel = t(locale, 'app.desktopRead.transcriptStart');
  const endLabel = t(locale, 'app.desktopRead.transcriptEnd');

  useEffect(() => {
    let cancelled = false;
    void createDesktopClient({ desktopCall })
      .listAcceptableRuns(sessionId, manuscriptId)
      .then((runs) => {
        if (!cancelled) setRunId(runs[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [desktopCall, manuscriptId, sessionId]);

  if (runId === null)
    return error ? <p role="alert">{t(locale, 'app.desktopRead.loadFailed')}</p> : null;

  const accept = () => {
    setError(false);
    const client = createDesktopClient({ desktopCall });
    void client
      .listAcceptableRuns(sessionId, manuscriptId)
      .then(async (runs) => {
        const run = runs.find((item) => item.id === runId);
        if (run === undefined) throw new Error('transcription run is not acceptable');
        const filled = rows.flatMap((row, index) => {
          const text = row.text.trim();
          if (text.length === 0) return [];
          const wholeRun = rows.length === 1 && row.start.trim() === '' && row.end.trim() === '';
          if (!wholeRun && (row.start.trim() === '' || row.end.trim() === '')) {
            throw new Error('transcription range is invalid');
          }
          const mediaStart = wholeRun ? run.rangeStart : Number(row.start);
          const mediaEnd = wholeRun ? run.rangeEnd : Number(row.end);
          if (
            !Number.isFinite(mediaStart) ||
            !Number.isFinite(mediaEnd) ||
            !(mediaEnd > mediaStart)
          ) {
            throw new Error('transcription range is invalid');
          }
          return [{ text, index, mediaStart, mediaEnd }];
        });
        if (filled.length === 0) return false;
        const preview = await client.previewModelRun(sessionId, {
          runId: run.id,
          candidates: filled.map((row, index) => ({
            chunkIndex: 0,
            segmentIndex: index,
            mediaStart: row.mediaStart,
            mediaEnd: row.mediaEnd,
          })),
        });
        for (const [index, row] of filled.entries()) {
          const candidate = preview.candidates[index];
          if (candidate === undefined || candidate.occupied) {
            throw new Error('transcription target is occupied');
          }
          await client.acceptModelRun(sessionId, {
            operationId: crypto.randomUUID(),
            runId: run.id,
            chunkIndex: candidate.chunkIndex,
            segmentIndex: candidate.segmentIndex,
            mediaStart: candidate.mediaStart,
            mediaEnd: candidate.mediaEnd,
            timeMappingRevision: preview.timeMappingRevision,
            targetFingerprint: candidate.targetFingerprint,
            text: row.text,
          });
        }
        return true;
      })
      .then((accepted) => {
        if (accepted !== true) return;
        setRows([{ text: '', start: '', end: '' }]);
        onAccepted();
      })
      .catch(() => setError(true));
  };

  return (
    <section aria-label={t(locale, 'app.desktopRead.acceptTranscript')}>
      {error ? <p role="alert">{t(locale, 'app.desktopRead.loadFailed')}</p> : null}
      {rows.map((row, index) => (
        <span key={index}>
          <input
            aria-label={index === 0 ? textLabel : `${textLabel} ${index + 1}`}
            value={row.text}
            onChange={(event) => setRow(index, { text: event.currentTarget.value })}
          />
          {rows.length === 1 ? null : (
            <>
              <input
                aria-label={`${startLabel} ${index + 1}`}
                value={row.start}
                onChange={(event) => setRow(index, { start: event.currentTarget.value })}
              />
              <input
                aria-label={`${endLabel} ${index + 1}`}
                value={row.end}
                onChange={(event) => setRow(index, { end: event.currentTarget.value })}
              />
            </>
          )}
        </span>
      ))}
      <button
        type="button"
        onClick={() => setRows((current) => [...current, { text: '', start: '', end: '' }])}
      >
        {t(locale, 'app.desktopRead.addTranscriptLine')}
      </button>
      <button type="button" onClick={accept}>
        {t(locale, 'app.desktopRead.acceptTranscript')}
      </button>
    </section>
  );

  function setRow(index: number, patch: Partial<TranscriptRow>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }
}
