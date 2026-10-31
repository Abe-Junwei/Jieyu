import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { useDesktopModelCandidatesController } from './useDesktopModelCandidatesController';
type Props = {
  host: DesktopReadHost;
  sessionId: string;
  manuscriptId: string;
  layerId: string;
  onAccepted: () => void;
};
export function DesktopModelCandidates(props: Props) {
  return (
    <Candidates
      key={JSON.stringify([props.sessionId, props.manuscriptId, props.layerId])}
      {...props}
    />
  );
}
function Candidates(props: Props) {
  const locale = useLocale();
  const flow = useDesktopModelCandidatesController(props);
  const working = flow.phase === 'running' || flow.phase === 'cancelling';
  const pending = (flow.result?.candidates.length ?? 0) > 0;
  return (
    <section aria-label={t(locale, 'app.desktopRead.modelCandidates')}>
      <h2>{t(locale, 'app.desktopRead.modelCandidates')}</h2>
      <button
        type="button"
        disabled={working || pending || flow.saving}
        onClick={() => void flow.chooseModel()}
      >
        {t(locale, 'app.desktopRead.chooseModel')}
      </button>
      {props.host.chooseLocalWhisper ? (
        <button
          type="button"
          disabled={working || pending || flow.saving}
          onClick={() => void flow.chooseModel(true)}
        >
          {t(locale, 'app.desktopRead.chooseLocalWhisper')}
        </button>
      ) : null}
      {flow.model === null ? null : (
        <p>
          {flow.model.modelId} {flow.model.version}
        </p>
      )}
      <label>
        {t(locale, 'app.desktopRead.modelRangeStart')}
        <input
          type="number"
          min="0"
          step="any"
          disabled={working || pending}
          value={flow.start}
          onChange={(e) => flow.setStart(e.currentTarget.value)}
        />
      </label>
      <label>
        {t(locale, 'app.desktopRead.modelRangeEnd')}
        <input
          type="number"
          min="0"
          step="any"
          disabled={working || pending}
          value={flow.end}
          onChange={(e) => flow.setEnd(e.currentTarget.value)}
        />
      </label>
      <button
        type="button"
        disabled={working || pending || flow.saving || flow.model === null}
        onClick={() => void flow.run()}
      >
        {t(locale, 'app.desktopRead.runModel')}
      </button>
      {working ? (
        <>
          <p role="status">{t(locale, 'app.desktopRead.modelRunning')}</p>
          <button
            type="button"
            disabled={flow.phase === 'cancelling'}
            onClick={() => void flow.cancel()}
          >
            {t(locale, 'app.desktopRead.cancelModel')}
          </button>
        </>
      ) : null}
      {flow.phase === 'error' ? (
        <p role="alert">{t(locale, 'app.desktopRead.modelFailed')}</p>
      ) : null}
      {flow.phase === 'empty' ? <p>{t(locale, 'app.desktopRead.modelEmpty')}</p> : null}
      {flow.phase === 'cancelled' ? <p>{t(locale, 'app.desktopRead.modelCancelled')}</p> : null}
      {flow.phase === 'interrupted' ? (
        <p role="alert">{t(locale, 'app.desktopRead.modelInterrupted')}</p>
      ) : null}
      {flow.phase === 'saved' ? <p>{t(locale, 'app.desktopRead.modelSaved')}</p> : null}
      {flow.phase === 'abandoned' ? <p>{t(locale, 'app.desktopRead.modelAbandoned')}</p> : null}
      {flow.warning ? <p role="status">{t(locale, 'app.desktopRead.modelWarnings')}</p> : null}
      <ul>
        {flow.result?.candidates.map((row) => (
          <li key={row.candidateId}>
            <span>
              {row.mediaStart}–{row.mediaEnd}
            </span>
            <input
              aria-label={`${t(locale, 'app.desktopRead.modelCandidateText')} ${row.candidateId}`}
              value={row.text}
              disabled={flow.saving}
              onChange={(e) => flow.edit(row.candidateId, e.currentTarget.value)}
            />
            {row.occupied ? <p>{t(locale, 'app.desktopRead.modelOccupied')}</p> : null}
            <button
              type="button"
              disabled={flow.saving || row.occupied || row.text.trim() === ''}
              onClick={() => void flow.accept(row.candidateId)}
            >
              {t(locale, 'app.desktopRead.acceptTranscript')}
            </button>
          </li>
        ))}
      </ul>
      {pending ? (
        <button type="button" disabled={flow.saving} onClick={() => void flow.abandon()}>
          {t(locale, 'app.desktopRead.abandonModel')}
        </button>
      ) : null}
    </section>
  );
}
