import { t, tf, type Locale } from '../i18n';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { DesktopTranscriptionCertaintyMenu } from './DesktopTranscriptionCertaintyMenu';
import { sharedSelfCertainty } from './desktopTranscriptionMetadata';

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
  /** Real delete target count after context-menu keep/replace. */
  selectedCount?: number;
  onClose: () => void;
  onPlayFrom: (time: number) => void;
  onToggleSkip: (unitId: string) => void;
  onDelete: (unitId: string) => void;
  onSplit: (unitId: string, time: number) => void;
  canMerge: (unitId: string) => boolean;
  onMerge: (unitId: string) => void;
  onOpenNotes?: () => void;
  certainty?: {
    open: boolean;
    current: ReturnType<typeof sharedSelfCertainty>;
    onToggle: () => void;
    onPick: (value: UnitSelfCertainty | null) => void;
  };
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
            <button
              type="button"
              role="menuitem"
              onClick={() => run(() => props.onSplit(unitId, menu.time))}
            >
              {t(locale, 'app.desktopTranscription.splitSegment')}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!props.canMerge(unitId)}
              onClick={() => run(() => props.onMerge(unitId))}
            >
              {t(locale, 'app.desktopTranscription.mergeNext')}
              <span className="desktop-tx-menu__key">⌘M</span>
            </button>
            {props.onOpenNotes === undefined ? null : (
              <button
                type="button"
                role="menuitem"
                onClick={() => run(() => props.onOpenNotes?.())}
              >
                {(props.selectedCount ?? 1) > 1
                  ? t(locale, 'app.desktopTranscription.addNoteMenu')
                  : t(locale, 'app.desktopTranscription.notesMenu')}
              </button>
            )}
            {props.certainty === undefined ? null : (
              <DesktopTranscriptionCertaintyMenu
                locale={locale}
                open={props.certainty.open}
                selectedCount={props.selectedCount ?? 1}
                current={props.certainty.current}
                onToggle={props.certainty.onToggle}
                onPick={(value) => run(() => props.certainty?.onPick(value))}
              />
            )}
            <button type="button" role="menuitem" onClick={() => run(() => props.onDelete(unitId))}>
              {(props.selectedCount ?? 1) > 1
                ? tf(locale, 'app.desktopTranscription.deleteConfirmMany', {
                    count: props.selectedCount ?? 1,
                  })
                : t(locale, 'app.desktopTranscription.deleteSegment')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
