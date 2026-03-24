import type { NoteCategory, MultiLangString, TranslationLayerDocType, UserNoteDocType, UtteranceDocType } from '../db';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import { getLayerLabelParts } from '../utils/transcriptionFormatters';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { NotePopover } from './NotePopover';

interface TranscriptionOverlaysProps {
  ctxMenu: { x: number; y: number; utteranceId: string; layerId: string; splitTime: number } | null;
  onCloseCtxMenu: () => void;
  uttOpsMenu: { x: number; y: number } | null;
  onCloseUttOpsMenu: () => void;
  selectedUtteranceId: string;
  selectedUtteranceIds: Set<string>;
  runDeleteSelection: (anchorId: string, selectedIds: Set<string>) => void;
  runMergeSelection: (selectedIds: Set<string>) => void;
  runSelectBefore: (id: string) => void;
  runSelectAfter: (id: string) => void;
  runDeleteOne: (id: string) => void;
  runMergePrev: (id: string) => void;
  runMergeNext: (id: string) => void;
  runSplitAtTime: (id: string, splitTime: number) => void;
  getCurrentTime: () => number;
  onOpenNoteFromMenu: (x: number, y: number, uttId: string, layerId?: string) => void;
  deleteConfirmState: { totalCount: number; textCount: number; emptyCount: number } | null;
  muteDeleteConfirmInSession: boolean;
  setMuteDeleteConfirmInSession: (value: boolean) => void;
  closeDeleteConfirmDialog: () => void;
  confirmDeleteFromDialog: () => void;
  notePopover: NotePopoverState | null;
  currentNotes: UserNoteDocType[];
  onCloseNotePopover: () => void;
  addNote: (content: MultiLangString, category?: NoteCategory) => Promise<void>;
  updateNote: (id: string, updates: { content?: MultiLangString; category?: NoteCategory }) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  utterances: UtteranceDocType[];
  getUtteranceTextForLayer: (utt: UtteranceDocType, layerId?: string) => string;
  transcriptionLayers: TranslationLayerDocType[];
  translationLayers: TranslationLayerDocType[];
}

export function TranscriptionOverlays(props: TranscriptionOverlaysProps) {
  const {
    ctxMenu,
    onCloseCtxMenu,
    uttOpsMenu,
    onCloseUttOpsMenu,
    selectedUtteranceId,
    selectedUtteranceIds,
    runDeleteSelection,
    runMergeSelection,
    runSelectBefore,
    runSelectAfter,
    runDeleteOne,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    getCurrentTime,
    onOpenNoteFromMenu,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
    notePopover,
    currentNotes,
    onCloseNotePopover,
    addNote,
    updateNote,
    deleteNote,
    utterances,
    getUtteranceTextForLayer,
    transcriptionLayers,
    translationLayers,
  } = props;

  return (
    <>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={onCloseCtxMenu}
          items={(() => {
            const id = ctxMenu.utteranceId;
            const multiCount = selectedUtteranceIds.size;
            const items: ContextMenuItem[] = multiCount > 1
              ? [
                  { label: `删除 ${multiCount} 个句段`, shortcut: '⌫', danger: true, onClick: () => { runDeleteSelection(id, selectedUtteranceIds); } },
                  { label: `合并 ${multiCount} 个句段`, onClick: () => { runMergeSelection(selectedUtteranceIds); } },
                  { label: '选中此句段及之前所有', shortcut: '⇧Home', onClick: () => { runSelectBefore(id); } },
                  { label: '选中此句段及之后所有', shortcut: '⇧End', onClick: () => { runSelectAfter(id); } },
                ]
              : [
                  { label: '删除句段', shortcut: '⌫', danger: true, onClick: () => { runDeleteOne(id); } },
                  { label: '向前合并', shortcut: '⌘⇧M', onClick: () => { runMergePrev(id); } },
                  { label: '向后合并', shortcut: '⌘M', onClick: () => { runMergeNext(id); } },
                  {
                    label: '从当前位置拆分句段',
                    shortcut: '⌘⇧S',
                    onClick: () => { runSplitAtTime(id, ctxMenu.splitTime); },
                  },
                  { label: '选中此句段及之前所有', shortcut: '⇧Home', onClick: () => { runSelectBefore(id); } },
                  { label: '选中此句段及之后所有', shortcut: '⇧End', onClick: () => { runSelectAfter(id); } },
                  { label: '添加备注', shortcut: '⌘⇧N', onClick: () => { onOpenNoteFromMenu(ctxMenu.x, ctxMenu.y, id, ctxMenu.layerId); } },
                ];
            return items;
          })()}
        />
      )}
      {uttOpsMenu && selectedUtteranceId && (
        <ContextMenu
          x={uttOpsMenu.x}
          y={uttOpsMenu.y}
          onClose={onCloseUttOpsMenu}
          items={(() => {
            const id = selectedUtteranceId;
            const multiCount = selectedUtteranceIds.size;
            if (multiCount > 1) {
              return [
                { label: `删除 ${multiCount} 个句段`, shortcut: '⌫', danger: true, onClick: () => { runDeleteSelection(id, selectedUtteranceIds); } },
                { label: `合并 ${multiCount} 个句段`, onClick: () => { runMergeSelection(selectedUtteranceIds); } },
              ];
            }
            return [
              { label: '删除句段', shortcut: '⌫', danger: true, onClick: () => { runDeleteOne(id); } },
              { label: '向前合并', shortcut: '⌘⇧M', onClick: () => { runMergePrev(id); } },
              { label: '向后合并', shortcut: '⌘M', onClick: () => { runMergeNext(id); } },
              { label: '拆分句段', shortcut: '⌘⇧S', onClick: () => { runSplitAtTime(id, getCurrentTime()); } },
            ];
          })()}
        />
      )}
      <ConfirmDeleteDialog
        open={Boolean(deleteConfirmState)}
        totalCount={deleteConfirmState?.totalCount ?? 0}
        textCount={deleteConfirmState?.textCount ?? 0}
        emptyCount={deleteConfirmState?.emptyCount ?? 0}
        muteInSession={muteDeleteConfirmInSession}
        onMuteChange={setMuteDeleteConfirmInSession}
        onCancel={closeDeleteConfirmDialog}
        onConfirm={confirmDeleteFromDialog}
      />
      {notePopover && (
        <NotePopover
          x={notePopover.x}
          y={notePopover.y}
          notes={currentNotes}
          targetLabel={(() => {
            const utt = utterances.find((u) => u.id === notePopover.uttId);
            const uttText = (utt ? getUtteranceTextForLayer(utt) : '').slice(0, 20);
            if (!notePopover.layerId) {
              return `句段 — ${uttText || '备注'}`;
            }
            const layer = [...transcriptionLayers, ...translationLayers].find((l) => l.id === notePopover.layerId);
            const layerLabel = layer ? getLayerLabelParts(layer) : null;
            const prefix = layerLabel ? `${layerLabel.type} ${layerLabel.lang}` : '';
            return prefix ? `${prefix} — ${uttText || '备注'}` : uttText || '备注';
          })()}
          onClose={onCloseNotePopover}
          onAdd={addNote}
          onUpdate={updateNote}
          onDelete={deleteNote}
        />
      )}
    </>
  );
}
