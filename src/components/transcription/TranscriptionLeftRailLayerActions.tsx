import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_LEFT_RAIL_CTX } from '../../utils/jieyuMaterialIcon';
import type { SidePaneSidebarMessages } from '../../i18n/sidePaneSidebarMessages';

/** DOM id for App shell `app-left-rail-bottom-slot` host; tests mount a matching node. */
export const LEFT_RAIL_TRANSCRIPTION_LAYER_ACTIONS_SLOT_ID = 'left-rail-transcription-layer-actions-slot';

type TranscriptionLeftRailLayerActionsProps = {
  messages: SidePaneSidebarMessages;
  disableCreateTranslationEntry: boolean;
  onCreateTranscription: () => void;
  onCreateTranslation: () => void;
};

export function TranscriptionLeftRailLayerActions({
  messages,
  disableCreateTranslationEntry,
  onCreateTranscription,
  onCreateTranslation,
}: TranscriptionLeftRailLayerActionsProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setHost(document.getElementById(LEFT_RAIL_TRANSCRIPTION_LAYER_ACTIONS_SLOT_ID));
  }, []);

  if (!host) return null;

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
    </div>,
    host,
  );
}
