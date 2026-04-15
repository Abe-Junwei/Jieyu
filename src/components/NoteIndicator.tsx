import { memo, type MouseEvent } from 'react';
import { MaterialSymbol } from './ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../utils/jieyuMaterialIcon';
import { t, tf, useLocale } from '../i18n';

interface NoteIndicatorProps {
  count: number;
  onClick: (e: MouseEvent) => void;
}

export const NoteIndicator = memo(function NoteIndicator({ count, onClick }: NoteIndicatorProps) {
  const locale = useLocale();
  const noteText = count > 0
    ? tf(locale, 'transcription.notes.count', { count })
    : t(locale, 'transcription.notes.add');

  return (
    <button
      type="button"
      className={`note-indicator ${count > 0 ? 'note-indicator-active' : 'note-indicator-empty'}`}
      onClick={onClick}
      title={noteText}
      aria-label={noteText}
    >
      <MaterialSymbol name="sticky_note_2" className={JIEYU_MATERIAL_INLINE} />
      {count > 0 && <span className="note-indicator-badge">{count}</span>}
    </button>
  );
});
