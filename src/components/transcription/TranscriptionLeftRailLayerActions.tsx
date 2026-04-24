import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_LEFT_RAIL_CTX } from '../../utils/jieyuMaterialIcon';
import type { SidePaneSidebarMessages } from '../../i18n/messages';
import { t, type Locale } from '../../i18n';

/** DOM id for App shell `app-left-rail-bottom-slot` host; tests mount a matching node. */
export const LEFT_RAIL_TRANSCRIPTION_LAYER_ACTIONS_SLOT_ID = 'left-rail-transcription-layer-actions-slot';

type WorkspaceTimelineLayoutControl = {
  locale: Locale;
  verticalViewActive: boolean;
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
      verticalViewActive,
      onSelectHorizontalMode,
      onSelectVerticalMode,
    } = workspaceTimelineLayout;
    const title = verticalViewActive
      ? t(locale, 'transcription.toolbar.switchToHorizontalView')
      : t(locale, 'transcription.toolbar.switchToVerticalView');
    const modeLabel = verticalViewActive
      ? t(locale, 'transcription.toolbar.verticalView')
      : t(locale, 'transcription.toolbar.horizontalView');
    const handleToggleLayout = () => {
      if (verticalViewActive) {
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
          aria-pressed={verticalViewActive}
          title={title}
          aria-label={modeLabel}
          onClick={handleToggleLayout}
        >
          {/* 必须带 jieyu-material：.app-left-rail .left-rail-btn > span:not(.jieyu-material) 会隐藏其它直接子 span */}
          <MaterialSymbol
            name={verticalViewActive ? 'view_agenda' : 'view_column_2'}
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
