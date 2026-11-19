import { useState } from 'react';
import { JieyuIcon } from '../components/ui/JieyuIcon';
import { t, type Locale } from '../i18n';
import type { DesktopPlaybackUnit } from './useDesktopTranscriptionMediaController';

interface ManuscriptItem {
  id: string;
  title: Record<string, string>;
}

export function DesktopTranscriptionContextColumn(props: {
  locale: Locale;
  manuscripts: readonly ManuscriptItem[];
  manuscriptId: string | null;
  layerId: string | null;
  units: readonly DesktopPlaybackUnit[];
  durationLabel: string | null;
  speakerCount: number;
  selectedUnitId: string | null;
  onSelectManuscript: (manuscriptId: string) => void;
  onSelectUnit: (unitId: string) => void;
}) {
  const [open, setOpen] = useState({
    manuscripts: false,
    layers: false,
    segments: false,
    speakers: false,
  });
  const currentTitle =
    props.manuscripts.find((item) => item.id === props.manuscriptId)?.title ?? null;
  const sections = [
    {
      id: 'manuscripts' as const,
      label: t(props.locale, 'app.desktopTranscription.contextManuscripts'),
      meta: '',
      empty: t(props.locale, 'app.desktopTranscription.contextEmptyManuscripts'),
      rows: props.manuscripts.map((item) => ({
        id: item.id,
        primary: Object.values(item.title)[0] ?? item.id,
        secondary: item.id === props.manuscriptId ? (props.durationLabel ?? '—') : '—',
        current: item.id === props.manuscriptId,
        onSelect: () => props.onSelectManuscript(item.id),
      })),
    },
    {
      id: 'layers' as const,
      label: t(props.locale, 'app.desktopTranscription.contextLayers'),
      meta: props.layerId ? '1' : '0',
      empty: t(props.locale, 'app.desktopTranscription.contextEmptyLayers'),
      rows: props.layerId
        ? [
            {
              id: props.layerId,
              primary: t(props.locale, 'app.desktopTranscription.contextLayerTranscription'),
              secondary: '',
              current: true,
              onSelect: () => undefined,
            },
          ]
        : [],
    },
    {
      id: 'segments' as const,
      label: t(props.locale, 'app.desktopTranscription.contextSegments'),
      meta: String(props.units.length),
      empty: t(props.locale, 'app.desktopTranscription.contextEmptySegments'),
      rows: props.units.map((unit) => ({
        id: unit.id,
        primary: `${formatCue(unit.startTime)} ${unit.text}`,
        secondary: '',
        current: unit.id === props.selectedUnitId,
        onSelect: () => props.onSelectUnit(unit.id),
      })),
    },
    {
      id: 'speakers' as const,
      label: t(props.locale, 'app.desktopTranscription.contextSpeakers'),
      meta: String(props.speakerCount),
      empty: '',
      rows: [],
    },
  ];

  const summary =
    currentTitle && props.selectedUnitId
      ? `${Object.values(currentTitle)[0] ?? ''} · 第 ${
          Math.max(
            props.units.findIndex((unit) => unit.id === props.selectedUnitId),
            0,
          ) + 1
        } 段`
      : currentTitle
        ? (Object.values(currentTitle)[0] ?? '')
        : '';

  return (
    <>
      <div className="desktop-tx-context-strip">
        <button
          type="button"
          className="desktop-tx-context-strip__open"
          aria-label={t(props.locale, 'app.sidePane.expand')}
          onClick={toggleContextPane}
        >
          <JieyuIcon name="PanelLeftOpen" aria-hidden />
        </button>
        <span className="desktop-tx-context-strip__label">{summary}</span>
      </div>
      <div className="desktop-tx-context">
        {sections.map((section) => {
          const expanded = open[section.id];
          return (
            <section
              key={section.id}
              className="desktop-tx-context__section"
              data-open={expanded ? 'true' : 'false'}
              data-section={section.id}
            >
              <div className="desktop-tx-context__head">
                <button
                  type="button"
                  className="desktop-tx-context__toggle"
                  aria-expanded={expanded}
                  onClick={() =>
                    setOpen((state) => ({ ...state, [section.id]: !state[section.id] }))
                  }
                >
                  <span className="desktop-tx-context__chevron" aria-hidden>
                    ›
                  </span>
                  <span className="desktop-tx-context__label">{section.label}</span>
                </button>
                <span className="desktop-tx-context__meta">{section.meta}</span>
                {section.id === 'manuscripts' ? (
                  <button
                    type="button"
                    className="desktop-tx-context__collapse"
                    aria-label={t(props.locale, 'app.sidePane.collapse')}
                    onClick={toggleContextPane}
                  >
                    <JieyuIcon name="PanelLeftClose" aria-hidden />
                  </button>
                ) : null}
              </div>
              {expanded ? (
                section.rows.length === 0 ? (
                  section.empty.length > 0 ? (
                    <p className="desktop-tx-context__empty">{section.empty}</p>
                  ) : null
                ) : (
                  <ul className="desktop-tx-context__rows">
                    {section.rows.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="desktop-tx-context__row"
                          aria-current={row.current ? 'true' : undefined}
                          onClick={row.onSelect}
                        >
                          <span>{row.primary}</span>
                          <span className="desktop-tx-context__aside">{row.secondary}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}

function toggleContextPane(): void {
  document.querySelector<HTMLButtonElement>('.app-side-pane-collapse-toggle')?.click();
}

function formatCue(seconds: number): string {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const rest = total - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
}
