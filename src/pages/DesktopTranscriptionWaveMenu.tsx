import { t, type Locale } from '../i18n';

export interface WaveMenuState {
  x: number;
  y: number;
  time: number;
  unitId: string | null;
}

interface WaveMenuUnit {
  id: string;
  startTime: number;
  endTime: number;
  skipProcessing?: boolean;
}

/** The marked segment under the pointer, else the selected one at `time`, else the first there. */
export function waveMenuUnitAt(
  units: readonly WaveMenuUnit[],
  time: number,
  target: EventTarget,
  selectedUnitId: string | null,
): string | null {
  const marked =
    target instanceof Element
      ? target.closest('[data-wave-unit]')?.getAttribute('data-wave-unit')
      : null;
  if (marked && units.some((unit) => unit.id === marked)) return marked;
  const hits = units.filter((unit) => time >= unit.startTime && time < unit.endTime);
  return (hits.find((unit) => unit.id === selectedUnitId) ?? hits[0])?.id ?? null;
}

/** Waveform context menu: play from here, and skip or delete the segment under the pointer. */
export function DesktopTranscriptionWaveMenu(props: {
  locale: Locale;
  menu: WaveMenuState;
  units: readonly WaveMenuUnit[];
  onClose: () => void;
  onPlayFrom: (time: number) => void;
  onToggleSkip: (unitId: string) => void;
  onDelete: (unitId: string) => void;
}) {
  const { locale, menu } = props;
  const unitId = menu.unitId;
  const run = (action: () => void) => {
    props.onClose();
    action();
  };
  return (
    <>
      <button
        type="button"
        className="desktop-tx-menu-backdrop"
        aria-label={t(locale, 'app.desktopTranscription.cancel')}
        onClick={props.onClose}
      />
      <div
        className="desktop-tx-menu desktop-tx-menu-fixed"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        data-testid="desktop-wave-menu"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => run(() => props.onPlayFrom(menu.time))}
        >
          {t(locale, 'transcription.ctxMenu.playFromHere')}
        </button>
        {unitId === null ? null : (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => run(() => props.onToggleSkip(unitId))}
            >
              {t(
                locale,
                props.units.some((unit) => unit.id === unitId && unit.skipProcessing === true)
                  ? 'transcription.wave.unskipProcessing'
                  : 'transcription.wave.skipProcessing',
              )}
            </button>
            <button type="button" role="menuitem" onClick={() => run(() => props.onDelete(unitId))}>
              {t(locale, 'app.desktopTranscription.deleteSegment')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
