import { memo, useCallback, useMemo, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { MaterialSymbol } from './ui/MaterialSymbol';
import { JIEYU_MATERIAL_MICRO, JIEYU_MATERIAL_PANEL } from '../utils/jieyuMaterialIcon';
import type { UserNoteDocType, NoteCategory, MultiLangString } from '../db';
import { useOptionalLocale } from '../i18n';
import { getNotePanelMessages } from '../i18n/notePanelMessages';
import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';
import { DialogShell } from './ui/DialogShell';
import { PanelButton } from './ui';
import { PanelSection } from './ui/PanelSection';

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
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  const panelWidth = useMemo(
    () => computeAdaptivePanelWidth({
      baseWidth: 380,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: 'standard',
      minWidth: 300,
      maxWidth: 640,
      ...(viewportWidth !== undefined ? { viewportWidth } : {}),
    }),
    [locale, uiFontScale, uiTextDirection, viewportWidth],
  );
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
    <DialogShell
      className="pnl-note-panel panel-design-match panel-design-match-dialog"
      headerClassName="note-panel-header"
      bodyClassName="note-panel-body"
      title={messages.panelTitle(targetLabel)}
      titleClassName="note-panel-title"
      actions={(
        <button type="button" className="note-panel-close icon-btn" onClick={onClose} aria-label={messages.closePanel}>
          <MaterialSymbol name="close" className={JIEYU_MATERIAL_PANEL} />
        </button>
      )}
      dir={uiTextDirection}
        layoutStyle={{ width: `min(${panelWidth}px, 100%)`, fontSize: `calc(1rem * ${uiFontScale})` }}
    >
      <PanelSection
        className="note-panel-list-surface"
      >
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
                    className="panel-input note-panel-textarea"
                    value={editContent}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
                    onKeyDown={(e) => handleEditKeyDown(e, note.id)}
                    aria-label={messages.editNoteContentLabel}
                    autoFocus
                  />
                  <div className="note-panel-edit-actions">
                    <PanelButton variant="success" className="note-panel-btn note-panel-btn-save" onClick={() => handleEditSave(note.id)}>
                      {messages.save}
                    </PanelButton>
                    <PanelButton variant="ghost" className="note-panel-btn note-panel-btn-cancel" onClick={() => setEditingId(null)}>
                      {messages.cancel}
                    </PanelButton>
                  </div>
                </div>
              ) : (
                <div className="note-panel-content" onDoubleClick={() => handleEditStart(note)}>
                  <p>{note.content['default'] ?? Object.values(note.content)[0] ?? ''}</p>
                  <div className="note-panel-actions">
                    <button
                      type="button"
                      className="note-panel-edit-trigger"
                      onClick={() => handleEditStart(note)}
                      title={messages.editNote}
                      aria-label={messages.editNote}
                    >
                      <MaterialSymbol name="edit" className={JIEYU_MATERIAL_MICRO} />
                    </button>
                    <button
                      type="button"
                      className="note-panel-delete"
                      onClick={() => onDelete(note.id)}
                      title={messages.deleteNote}
                      aria-label={messages.deleteNote}
                    >
                      <MaterialSymbol name="delete" className={JIEYU_MATERIAL_MICRO} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        className="note-panel-add"
      >
        <textarea
          className="panel-input note-panel-textarea"
          placeholder={messages.newNotePlaceholder}
          value={newContent}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewContent(e.target.value)}
          onKeyDown={handleAddKeyDown}
          aria-label={messages.newNoteContentLabel}
        />
        <div className="note-panel-add-actions">
          <div className="note-panel-tags" role="group" aria-label={messages.newNoteCategoryLabel}>
            {categories.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`note-panel-category note-panel-category-${c.value}${newCategory === c.value ? ' note-panel-category-selected' : ''}`}
                onClick={() => setNewCategory(c.value)}
                aria-label={`${messages.newNoteCategoryLabel}: ${c.label}`}
                aria-pressed={newCategory === c.value}
              >
                {c.label}
              </button>
            ))}
          </div>
          <PanelButton variant="primary" className="note-panel-btn note-panel-btn-add" onClick={handleAdd} disabled={!newContent.trim()}>
            {messages.add}
          </PanelButton>
        </div>
      </PanelSection>
    </DialogShell>
  );
});
