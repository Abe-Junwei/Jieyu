import { memo, useCallback, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { UserNoteDocType, NoteCategory, MultiLangString } from '../db';
import { useOptionalLocale } from '../i18n';
import { getNotePanelMessages } from '../i18n/notePanelMessages';

interface NotePanelProps {
  isOpen: boolean;
  notes: UserNoteDocType[];
  targetLabel: string;
  onClose: () => void;
  onAdd: (content: MultiLangString, category?: NoteCategory) => Promise<void>;
  onUpdate: (id: string, updates: { content?: MultiLangString; category?: NoteCategory }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const NotePanel = memo(function NotePanel({
  isOpen,
  notes,
  targetLabel,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
}: NotePanelProps) {
  const locale = useOptionalLocale() ?? 'zh-CN';
  const messages = getNotePanelMessages(locale);
  const categories: { value: NoteCategory; label: string }[] = [
    { value: 'comment', label: messages.categoryComment },
    { value: 'question', label: messages.categoryQuestion },
    { value: 'todo', label: messages.categoryTodo },
  ];
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<NoteCategory | ''>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleAdd = useCallback(async () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    await onAdd({ default: trimmed }, newCategory || undefined);
    setNewContent('');
    setNewCategory('');
  }, [newContent, newCategory, onAdd]);

  const handleAddKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
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

  if (!isOpen) return null;

  return (
    <div className="note-panel">
      <div className="note-panel-header">
        <h3 className="note-panel-title">{messages.panelTitle(targetLabel)}</h3>
        <button type="button" className="note-panel-close" onClick={onClose} aria-label={messages.closePanel}>
          <X size={16} />
        </button>
      </div>

      <div className="note-panel-list">
        {notes.length === 0 && <p className="note-panel-empty">{messages.empty}</p>}
        {notes.map((note) => (
          <div key={note.id} className="note-panel-item">
            {note.category && (
              <span className={`note-panel-category note-panel-category-${note.category}`}>
                {categories.find((c) => c.value === note.category)?.label ?? note.category}
              </span>
            )}
            {editingId === note.id ? (
              <div className="note-panel-edit">
                <textarea
                  className="note-panel-textarea"
                  value={editContent}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
                  onKeyDown={(e) => handleEditKeyDown(e, note.id)}
                  autoFocus
                />
                <div className="note-panel-edit-actions">
                  <button type="button" className="note-panel-btn note-panel-btn-save" onClick={() => handleEditSave(note.id)}>
                    {messages.save}
                  </button>
                  <button type="button" className="note-panel-btn note-panel-btn-cancel" onClick={() => setEditingId(null)}>
                    {messages.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div className="note-panel-content" onDoubleClick={() => handleEditStart(note)}>
                <p>{note.content['default'] ?? Object.values(note.content)[0] ?? ''}</p>
                <button
                  type="button"
                  className="note-panel-delete"
                  onClick={() => onDelete(note.id)}
                  title={messages.deleteNote}
                  aria-label={messages.deleteNote}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="note-panel-add">
        <textarea
          className="note-panel-textarea"
          placeholder={messages.newNotePlaceholder}
          value={newContent}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewContent(e.target.value)}
          onKeyDown={handleAddKeyDown}
        />
        <div className="note-panel-add-actions">
          <select
            className="note-panel-category-select"
            value={newCategory}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewCategory(e.target.value as NoteCategory | '')}
          >
            <option value="">{messages.noCategory}</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button type="button" className="note-panel-btn note-panel-btn-add" onClick={handleAdd} disabled={!newContent.trim()}>
            <Plus size={14} /> {messages.add}
          </button>
        </div>
      </div>
    </div>
  );
});
