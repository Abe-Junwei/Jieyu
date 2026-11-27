import { useState } from 'react';
import { JieyuIcon } from '../components/ui/JieyuIcon';
import { t, tf, type Locale } from '../i18n';
import {
  speakerFilterActive,
  speakerFilterHeaderMeta,
  speakerFilterRows,
  type SpeakerFilterState,
} from './desktopTranscriptionSpeakerFilter';

export function DesktopTranscriptionSpeakerFilterPanel(props: {
  locale: Locale;
  speakers: readonly { id: string; name: string }[];
  units: readonly { speakerId?: string | null }[];
  filter: SpeakerFilterState;
  onToggleSpeaker: (speakerId: string) => void;
  onToggleUnassigned: () => void;
  onClear: () => void;
  onCreateAndAssign: () => void;
}) {
  const [query, setQuery] = useState('');
  const rows = speakerFilterRows(
    props.speakers,
    props.units,
    t(props.locale, 'app.desktopTranscription.speakerFilterUnassigned'),
  );
  const meta = speakerFilterHeaderMeta(props.filter, rows.length, {
    all: (count) => tf(props.locale, 'app.desktopTranscription.speakerFilterAll', { count }),
    filtering: (count) =>
      tf(props.locale, 'app.desktopTranscription.speakerFilterActive', { count }),
  });
  const filtering = speakerFilterActive(props.filter);
  return (
    <div className="desktop-tx-speaker-filter" data-testid="desktop-tx-speaker-filter">
      <div className="desktop-tx-speaker-filter__meta" aria-live="polite">
        {meta}
      </div>
      <input
        aria-label={t(props.locale, 'app.desktopTranscription.speakerSearch')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t(props.locale, 'app.desktopTranscription.speakerSearch')}
      />
      <ul className="desktop-tx-speaker-filter__rows">
        {rows
          .filter(
            (row) =>
              row.id === '' ||
              row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
          )
          .map((row) => {
            const checked =
              row.id === ''
                ? props.filter.includeUnassigned
                : props.filter.speakerIds.includes(row.id);
            return (
              <li key={row.id === '' ? 'unassigned' : row.id}>
                <label className="desktop-tx-speaker-filter__row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      row.id === '' ? props.onToggleUnassigned() : props.onToggleSpeaker(row.id)
                    }
                  />
                  <span className="desktop-tx-speaker-filter__name">{row.name}</span>
                  <span className="desktop-tx-speaker-filter__count">{row.count}</span>
                </label>
              </li>
            );
          })}
      </ul>
      <div className="desktop-tx-speaker-filter__actions">
        <button
          type="button"
          className="desktop-tx-speaker-filter__icon"
          data-testid="desktop-tx-speaker-filter-clear"
          aria-label={t(props.locale, 'app.desktopTranscription.speakerFilterClear')}
          disabled={!filtering}
          onClick={props.onClear}
        >
          <JieyuIcon name="X" />
        </button>
        <button
          type="button"
          className="desktop-tx-speaker-filter__icon"
          data-testid="desktop-tx-speaker-filter-create"
          aria-label={t(props.locale, 'app.desktopTranscription.speakerFilterCreate')}
          onClick={props.onCreateAndAssign}
        >
          <JieyuIcon name="Plus" />
        </button>
      </div>
    </div>
  );
}
