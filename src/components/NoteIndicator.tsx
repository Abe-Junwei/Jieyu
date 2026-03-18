import { memo, type MouseEvent } from 'react';
import { StickyNote } from 'lucide-react';

interface NoteIndicatorProps {
  count: number;
  onClick: (e: MouseEvent) => void;
}

export const NoteIndicator = memo(function NoteIndicator({ count, onClick }: NoteIndicatorProps) {
  return (
    <button
      type="button"
      className={`note-indicator ${count > 0 ? 'note-indicator-active' : 'note-indicator-empty'}`}
      onClick={onClick}
      title={count > 0 ? `${count} 条备注` : '添加备注'}
      aria-label={count > 0 ? `${count} 条备注` : '添加备注'}
    >
      <StickyNote size={14} />
      {count > 0 && <span className="note-indicator-badge">{count}</span>}
    </button>
  );
});
