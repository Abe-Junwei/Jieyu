import { useState } from 'react';
import { JieyuIcon } from '../components/ui/JieyuIcon';
import { t, tf, type Locale } from '../i18n';
import {
  DesktopTranscriptionLayerList,
  type ContextLayer,
  type ContextLink,
  type LayerHostsInput,
} from './DesktopTranscriptionLayerList';
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
  layers: readonly ContextLayer[];
  links: readonly ContextLink[];
  layerError: string;
  onCreateLayer: (kind: 'transcription' | 'translation', label: string) => void;
  onCreatePair?: (kind: 'voice' | 'oral', audioName: string, textName: string) => void;
  onRenameLayer: (layerId: string, name: Record<string, string>) => void;
  onMoveLayer: (layerId: string, direction: 'up' | 'down') => void;
  onDeleteLayer: (
    layerId: string,
    mode: 'soft' | 'migrate' | 'purge',
    targetLayerId?: string,
  ) => void;
  onPreviewHosts?: (input: LayerHostsInput) => Promise<{
    removed: Array<{ hostLayerId: string; texts: number; drafts: number }>;
    blocked: boolean;
  } | null>;
  onSetHosts?: (input: LayerHostsInput) => void;
  onClearLayerError?: () => void;
  onSelectLayer: (layerId: string) => void;
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
      icon: 'FileText' as const,
      label: t(props.locale, 'app.desktopTranscription.contextManuscripts'),
      meta: '',
      empty: t(props.locale, 'app.desktopTranscription.contextEmptyManuscripts'),
      rows: props.manuscripts.map((item) => ({
        id: item.id,
        time: '',
        primary: Object.values(item.title)[0] ?? item.id,
        secondary: item.id === props.manuscriptId ? (props.durationLabel ?? '—') : '—',
        current: item.id === props.manuscriptId,
        onSelect: () => props.onSelectManuscript(item.id),
      })),
    },
    {
      id: 'layers' as const,
      icon: 'Layers' as const,
      label: t(props.locale, 'app.desktopTranscription.contextLayers'),
      meta: String(props.layers.length),
      empty: '',
      rows: [],
    },
    {
      id: 'segments' as const,
      icon: 'Captions' as const,
      label: t(props.locale, 'app.desktopTranscription.contextSegments'),
      meta: String(props.units.length),
      empty: t(props.locale, 'app.desktopTranscription.contextEmptySegments'),
      rows: props.units.map((unit) => ({
        id: unit.id,
        time: formatCue(unit.startTime),
        primary: unit.text,
        secondary: '',
        current: unit.id === props.selectedUnitId,
        onSelect: () => props.onSelectUnit(unit.id),
      })),
    },
    {
      id: 'speakers' as const,
      icon: 'Users' as const,
      label: t(props.locale, 'app.desktopTranscription.contextSpeakers'),
      meta: String(props.speakerCount),
      empty: '',
      rows: [],
    },
  ];

  const title = currentTitle ? (Object.values(currentTitle)[0] ?? '') : '';
  const segmentOrdinal =
    props.selectedUnitId === null
      ? ''
      : tf(props.locale, 'app.desktopTranscription.contextSegmentOrdinal', {
          index:
            Math.max(
              props.units.findIndex((unit) => unit.id === props.selectedUnitId),
              0,
            ) + 1,
        });
  const summary = [title, segmentOrdinal].filter((part) => part.length > 0).join(' · ');

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
                    <JieyuIcon name="ChevronRight" />
                  </span>
                  <span className="desktop-tx-context__mark" aria-hidden>
                    <JieyuIcon name={section.icon} />
                  </span>
                  <span className="desktop-tx-context__label">{section.label}</span>
                  <span className="desktop-tx-context__meta">{section.meta}</span>
                </button>
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
              {expanded && section.id === 'layers' ? (
                <DesktopTranscriptionLayerList
                  locale={props.locale}
                  layers={props.layers}
                  links={props.links}
                  currentId={props.layerId}
                  error={props.layerError}
                  onSelect={props.onSelectLayer}
                  onCreate={props.onCreateLayer}
                  {...(props.onCreatePair === undefined
                    ? {}
                    : { onCreatePair: props.onCreatePair })}
                  onRename={props.onRenameLayer}
                  onMove={props.onMoveLayer}
                  onDelete={props.onDeleteLayer}
                  {...(props.onPreviewHosts === undefined
                    ? {}
                    : { onPreviewHosts: props.onPreviewHosts })}
                  {...(props.onSetHosts === undefined ? {} : { onSetHosts: props.onSetHosts })}
                  {...(props.onClearLayerError === undefined
                    ? {}
                    : { onClearError: props.onClearLayerError })}
                />
              ) : expanded ? (
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
                          {row.time.length > 0 ? (
                            <span className="desktop-tx-context__time">{row.time}</span>
                          ) : null}
                          <span className="desktop-tx-context__name">{row.primary}</span>
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
