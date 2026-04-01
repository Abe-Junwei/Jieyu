import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { UserNoteDocType, NoteCategory, MultiLangString } from '../db';
import { useOptionalLocale } from '../i18n';
import { getNotePanelMessages } from '../i18n/notePanelMessages';

interface NotePopoverProps {
  x: number;
  y: number;
  notes: UserNoteDocType[];
  targetLabel: ReactNode;
  onClose: () => void;
  onAdd: (content: MultiLangString, category?: NoteCategory) => Promise<void>;
  onUpdate: (id: string, updates: { content?: MultiLangString; category?: NoteCategory }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const NotePopover = memo(function NotePopover({
  x, y, notes, targetLabel, onClose, onAdd, onUpdate, onDelete,
}: NotePopoverProps) {
  const locale = useOptionalLocale() ?? 'zh-CN';
  const messages = getNotePanelMessages(locale);
  const categories: { value: NoteCategory; label: string }[] = [
    { value: 'comment', label: messages.categoryComment },
    { value: 'question', label: messages.categoryQuestion },
    { value: 'todo', label: messages.categoryTodo },
  ];
  const ref = useRef<HTMLDivElement>(null);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<NoteCategory>('comment');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [pos, setPos] = useState(() => ({ left: x, top: y }));

  // Clamp to viewport before paint
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width > vw - 12) left = vw - rect.width - 12;
    if (top + rect.height > vh - 12) top = vh - rect.height - 12;
    if (left < 12) left = 12;
    if (top < 12) top = 12;
    setPos({ left, top });
  }, [x, y]);

  // Close on outside click or Escape
  useEffect(() => {
    const handler = (e: MouseEvent | globalThis.KeyboardEvent) => {
      if ('key' in e && e.key === 'Escape') {
        // Don't close if editing — let the edit handler cancel first
        if (ref.current?.contains(e.target as Node)) return;
        onClose();
        return;
      }
      if ('button' in e && ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  const handleAdd = useCallback(async () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    await onAdd({ default: trimmed }, newCategory);
    setNewContent('');
    onClose();
  }, [newCategory, newContent, onAdd, onClose]);

  const handleAddKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleAdd();
      }
      if (e.key === 'Escape') onClose();
    },
    [handleAdd, onClose],
  );

  const handleEditStart = useCallback((note: UserNoteDocType) => {
    setEditingId(note.id);
    setEditContent(note.content['default'] ?? Object.values(note.content)[0] ?? '');
  }, []);

  const handleEditSave = useCallback(
    async (id: string) => {
      const trimmed = editContent.trim();
      if (!trimmed) return;
      await onUpdate(id, { content: { default: trimmed } });
      setEditingId(null);
      setEditContent('');
    },
    [editContent, onUpdate],
  );

  const handleEditKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>, id: string) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleEditSave(id);
      }
      if (e.key === 'Escape') {
        setEditingId(null);
      }
    },
    [handleEditSave],
  );

  return (
    <div ref={ref} className="note-popover" style={{ left: pos.left, top: pos.top }}>
      <div className="note-popover-header">
        <span className="note-popover-title">{targetLabel}</span>
        <button type="button" className="note-popover-close" onClick={onClose}><X size={14} /></button>
      </div>

      {notes.length > 0 && (
        <div className="note-popover-list">
          {notes.map((note) => (
            <div key={note.id} className="note-popover-item">
              {note.category && (
                <span className={`note-popover-tag note-popover-tag-${note.category}`}>
                  {categories.find((c) => c.value === note.category)?.label ?? note.category}
                </span>
              )}
              {editingId === note.id ? (
                <div className="note-popover-edit">
                  <textarea
                    className="note-popover-textarea"
                    value={editContent}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
                    onKeyDown={(e) => handleEditKeyDown(e, note.id)}
                    autoFocus
                  />
                  <div className="note-popover-edit-actions">
                    <button type="button" className="note-popover-btn note-popover-btn-save" onClick={() => handleEditSave(note.id)}>{messages.save}</button>
                    <button type="button" className="note-popover-btn note-popover-btn-cancel" onClick={() => setEditingId(null)}>{messages.cancel}</button>
                  </div>
                </div>
              ) : (
                <div className="note-popover-content" onDoubleClick={() => handleEditStart(note)}>
                  <p>{note.content['default'] ?? Object.values(note.content)[0] ?? ''}</p>
                  <button type="button" className="note-popover-delete" onClick={() => onDelete(note.id)} title={messages.deleteNote}><Trash2 size={11} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="note-popover-add">
        <textarea
          className="note-popover-textarea"
          placeholder={messages.newNotePlaceholder}
          value={newContent}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewContent(e.target.value)}
          onKeyDown={handleAddKeyDown}
          autoFocus={notes.length === 0}
        />
        <div className="note-popover-add-row">
          <div className="note-popover-tags">
            {categories.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`note-popover-tag note-popover-tag-${c.value}${newCategory === c.value ? ' note-popover-tag-selected' : ''}`}
                onClick={() => setNewCategory(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button type="button" className="note-popover-btn note-popover-btn-add" onClick={handleAdd} disabled={!newContent.trim()}>
            <Plus size={12} /> {messages.add}
          </button>
        </div>
      </div>
    </div>
  );
});
