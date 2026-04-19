import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_LEFT_RAIL_CTX } from '../../utils/jieyuMaterialIcon';
import type { SidePaneSidebarMessages } from '../../i18n/sidePaneSidebarMessages';
import { t, type Locale } from '../../i18n';

/** DOM id for App shell `app-left-rail-bottom-slot` host; tests mount a matching node. */
export const LEFT_RAIL_TRANSCRIPTION_LAYER_ACTIONS_SLOT_ID = 'left-rail-transcription-layer-actions-slot';

type WorkspaceTimelineLayoutControl = {
  locale: Locale;
  comparisonViewActive: boolean;
  translationLayerCount: number;
  onSelectHorizontalMode: () => void;
  onSelectVerticalMode: () => void;
};

type TranscriptionLeftRailLayerActionsProps = {
  messages: SidePaneSidebarMessages;
  disableCreateTranslationEntry: boolean;
  onCreateTranscription: () => void;
  onCreateTranslation: () => void;
  workspaceTimelineLayout?: WorkspaceTimelineLayoutControl;
};

export function TranscriptionLeftRailLayerActions({
  messages,
  disableCreateTranslationEntry,
  onCreateTranscription,
  onCreateTranslation,
  workspaceTimelineLayout,
}: TranscriptionLeftRailLayerActionsProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setHost(document.getElementById(LEFT_RAIL_TRANSCRIPTION_LAYER_ACTIONS_SLOT_ID));
  }, []);

  if (!host) return null;

  let workspaceLayoutNode: ReactNode = null;
  if (workspaceTimelineLayout) {
    const {
      locale,
      comparisonViewActive,
      translationLayerCount,
      onSelectHorizontalMode,
      onSelectVerticalMode,
    } = workspaceTimelineLayout;
    const verticalDisabled = translationLayerCount === 0;
    const toggleDisabled = !comparisonViewActive && verticalDisabled;
    const title = toggleDisabled
      ? t(locale, 'transcription.toolbar.comparisonRequiresTranslationLayer')
      : (comparisonViewActive
        ? t(locale, 'transcription.toolbar.switchToTimelineView')
        : t(locale, 'transcription.toolbar.switchToComparisonView'));
    const modeLabel = comparisonViewActive
      ? t(locale, 'transcription.toolbar.compareView')
      : t(locale, 'transcription.toolbar.timelineView');
    const handleToggleLayout = () => {
      if (comparisonViewActive) {
        onSelectHorizontalMode();
      } else {
        onSelectVerticalMode();
      }
    };
    workspaceLayoutNode = (
      <div
        className="left-rail-workspace-layout-root"
        role="group"
        aria-label={messages.workspaceLayoutModeStripAria}
      >
        <button
          type="button"
          data-testid="left-rail-workspace-layout-toggle"
          className="left-rail-btn left-rail-workspace-layout-toggle-btn"
          aria-pressed={comparisonViewActive}
          title={title}
          aria-label={modeLabel}
          disabled={toggleDisabled}
          onClick={handleToggleLayout}
        >
          {/* 必须带 jieyu-material：.app-left-rail .left-rail-btn > span:not(.jieyu-material) 会隐藏其它直接子 span */}
          <MaterialSymbol
            name={comparisonViewActive ? 'view_agenda' : 'view_column_2'}
            aria-hidden
            className={`${JIEYU_MATERIAL_LEFT_RAIL_CTX} left-rail-workspace-layout-toggle-icon`}
          />
          <span>{modeLabel}</span>
        </button>
      </div>
    );
  }

  return createPortal(
    <div
      className="left-rail-layer-actions-root"
      role="group"
      aria-label={messages.layerCreateStripAria}
    >
      <button
        type="button"
        className="left-rail-btn"
        title={messages.quickActionCreateTranscription}
        aria-label={messages.quickActionCreateTranscription}
        onClick={onCreateTranscription}
      >
        <MaterialSymbol name="layers" aria-hidden className={JIEYU_MATERIAL_LEFT_RAIL_CTX} />
        <span>{messages.quickActionCreateTranscription}</span>
      </button>
      <button
        type="button"
        className="left-rail-btn"
        title={messages.quickActionCreateTranslation}
        aria-label={messages.quickActionCreateTranslation}
        disabled={disableCreateTranslationEntry}
        onClick={onCreateTranslation}
      >
        <MaterialSymbol name="translate" aria-hidden className={JIEYU_MATERIAL_LEFT_RAIL_CTX} />
        <span>{messages.quickActionCreateTranslation}</span>
      </button>
      {workspaceLayoutNode}
    </div>,
    host,
  );
}
