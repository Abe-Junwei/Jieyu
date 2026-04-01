import type { ReactNode } from 'react';
import type { NoteCategory, MultiLangString, LayerDocType, LayerDisplaySettings, OrthographyDocType, UserNoteDocType, UtteranceDocType } from '../db';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import type { SpeakerFilterOption } from '../hooks/useSpeakerActions';
import type { TimelineUnit, TimelineUnitKind } from '../hooks/transcriptionTypes';
import { useOptionalLocale } from '../i18n';
import { getTranscriptionOverlaysMessages } from '../i18n/transcriptionOverlaysMessages';
import { getLayerLabelParts } from '../utils/transcriptionFormatters';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { NotePopover } from './NotePopover';
import { buildLayerStyleMenuItems } from './LayerStyleSubmenu';
import { buildOrthographyPreviewTextProps, resolveOrthographyRenderPolicy, type LocalFontEntry } from '../utils/layerDisplayStyle';

interface TranscriptionOverlaysProps {
  ctxMenu: { x: number; y: number; unitId: string; layerId: string; unitKind: TimelineUnitKind; splitTime: number; source?: 'timeline' | 'waveform' } | null;
  onCloseCtxMenu: () => void;
  uttOpsMenu: { x: number; y: number } | null;
  onCloseUttOpsMenu: () => void;
  selectedTimelineUnit?: TimelineUnit | null;
  selectedUtteranceIds: Set<string>;
  runDeleteSelection: (anchorId: string, selectedIds: Set<string>, unitKind: TimelineUnitKind, layerId: string) => void;
  runMergeSelection: (selectedIds: Set<string>, unitKind: TimelineUnitKind, layerId: string) => void;
  runSelectBefore: (id: string) => void;
  runSelectAfter: (id: string) => void;
  runDeleteOne: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runMergePrev: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runMergeNext: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runSplitAtTime: (id: string, splitTime: number, unitKind: TimelineUnitKind, layerId: string) => void;
  getCurrentTime: () => number;
  onOpenNoteFromMenu: (x: number, y: number, uttId: string, layerId?: string, scope?: 'timeline' | 'waveform') => void;
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
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  speakerOptions?: Array<{ id: string; name: string }>;
  speakerFilterOptions?: SpeakerFilterOption[];
  onAssignSpeakerFromMenu?: (unitIds: Iterable<string>, kind: TimelineUnitKind, speakerId?: string) => void;
  onOpenSpeakerManagementPanelFromMenu?: () => void;
  /** 层显示样式控制 | Layer display style control for context menu */
  displayStyleControl?: {
    orthographies: OrthographyDocType[];
    onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
    onReset: (layerId: string) => void;
    localFonts?: {
      fonts: LocalFontEntry[];
      status: 'idle' | 'loading' | 'loaded' | 'denied' | 'unsupported';
      load: () => Promise<void>;
    };
  };
}

export function TranscriptionOverlays(props: TranscriptionOverlaysProps) {
  const locale = useOptionalLocale() ?? 'zh-CN';
  const messages = getTranscriptionOverlaysMessages(locale);
  const {
    ctxMenu,
    onCloseCtxMenu,
    uttOpsMenu,
    onCloseUttOpsMenu,
    selectedTimelineUnit,
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
    speakerOptions = [],
    speakerFilterOptions = [],
    onAssignSpeakerFromMenu = () => {},
    onOpenSpeakerManagementPanelFromMenu = () => {},
    displayStyleControl,
  } = props;

  const recentSpeakerOptions = speakerFilterOptions
    .sort((left, right) => right.count - left.count)
    .slice(0, 3)
    .map((option) => ({ id: option.key, name: option.name }));

  const fullSpeakerOptions = speakerOptions.length > 0 ? speakerOptions : recentSpeakerOptions;
  const allTextLayers = [...transcriptionLayers, ...translationLayers];
  const defaultPreviewLayer = transcriptionLayers.find((layer) => layer.isDefault) ?? transcriptionLayers[0];

  const buildNotePopoverTargetLabel = (): ReactNode => {
    if (!notePopover) return messages.note;

    const utt = utterances.find((u) => u.id === notePopover.uttId);
    const previewLayer = notePopover.layerId
      ? allTextLayers.find((layer) => layer.id === notePopover.layerId)
      : defaultPreviewLayer;
    const uttText = (utt ? getUtteranceTextForLayer(utt, previewLayer?.id) : '').slice(0, 20);
    const fallbackLabel = messages.note;

    const prefix = (() => {
      if (!notePopover.layerId) return messages.segment;
      const layerLabel = previewLayer ? getLayerLabelParts(previewLayer) : null;
      return layerLabel ? `${layerLabel.type} ${layerLabel.lang}` : '';
    })();

    if (!uttText) {
      return prefix ? `${prefix} — ${fallbackLabel}` : fallbackLabel;
    }

    if (!previewLayer?.languageId || !displayStyleControl) {
      return prefix ? `${prefix} — ${uttText}` : uttText;
    }

    const renderPolicy = resolveOrthographyRenderPolicy(
      previewLayer.languageId,
      displayStyleControl.orthographies,
      previewLayer.orthographyId,
    );
    const previewTextProps = buildOrthographyPreviewTextProps(renderPolicy, previewLayer.displaySettings);

    return (
      <>
        {prefix ? <span>{prefix} — </span> : null}
        <span dir={previewTextProps.dir} style={previewTextProps.style}>
          {uttText}
        </span>
      </>
    );
  };

  return (
    <>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={onCloseCtxMenu}
          items={(() => {
            const id = ctxMenu.unitId;
            const multiCount = selectedUtteranceIds.size;
            const targetIds = multiCount > 1 ? Array.from(selectedUtteranceIds) : [id];
            const targetKind = ctxMenu.unitKind;
            const isSegmentUnitContext = targetKind === 'segment';
            const isTranscriptionLayerContext = transcriptionLayers.some((layer) => layer.id === ctxMenu.layerId);
            const items: ContextMenuItem[] = multiCount > 1
              ? [
                  { label: messages.deleteSegments(multiCount), shortcut: '⌫', danger: true, onClick: () => { runDeleteSelection(id, selectedUtteranceIds, targetKind, ctxMenu.layerId); } },
                  ...(isSegmentUnitContext
                    ? []
                    : [{ label: messages.mergeSegments(multiCount), onClick: () => { runMergeSelection(selectedUtteranceIds, targetKind, ctxMenu.layerId); } }]),
                  ...(isSegmentUnitContext
                    ? []
                    : [
                        { label: messages.selectBeforeAll, shortcut: '⇧Home', onClick: () => { runSelectBefore(id); } },
                        { label: messages.selectAfterAll, shortcut: '⇧End', onClick: () => { runSelectAfter(id); } },
                      ]),
                ]
              : [
                  { label: messages.deleteSegment, shortcut: '⌫', danger: true, onClick: () => { runDeleteOne(id, targetKind, ctxMenu.layerId); } },
                  { label: messages.mergePrevious, shortcut: '⌘⇧M', onClick: () => { runMergePrev(id, targetKind, ctxMenu.layerId); } },
                  { label: messages.mergeNext, shortcut: '⌘M', onClick: () => { runMergeNext(id, targetKind, ctxMenu.layerId); } },
                  {
                    label: messages.splitFromCurrent,
                    shortcut: '⌘⇧S',
                    onClick: () => { runSplitAtTime(id, ctxMenu.splitTime, targetKind, ctxMenu.layerId); },
                  },
                  ...(isSegmentUnitContext
                    ? []
                    : [
                        { label: messages.selectBeforeAll, shortcut: '⇧Home', onClick: () => { runSelectBefore(id); } },
                        { label: messages.selectAfterAll, shortcut: '⇧End', onClick: () => { runSelectAfter(id); } },
                      ]),
                  { label: messages.addNote, shortcut: '⌘⇧N', onClick: () => { onOpenNoteFromMenu(ctxMenu.x, ctxMenu.y, id, ctxMenu.layerId, ctxMenu.source ?? 'timeline'); } },
                ];

            if (isTranscriptionLayerContext) {
              const speakerManageItems: ContextMenuItem[] = [];
              for (const speaker of recentSpeakerOptions) {
                speakerManageItems.push({
                  label: messages.assignSpeakerRecent(speaker.name),
                  onClick: () => { onAssignSpeakerFromMenu(targetIds, targetKind, speaker.id); },
                });
              }
              for (const speaker of fullSpeakerOptions) {
                if (recentSpeakerOptions.some((recent) => recent.id === speaker.id)) continue;
                speakerManageItems.push({
                  label: messages.assignSpeaker(speaker.name),
                  onClick: () => { onAssignSpeakerFromMenu(targetIds, targetKind, speaker.id); },
                });
              }
              speakerManageItems.push({
                label: messages.clearSpeaker,
                onClick: () => { onAssignSpeakerFromMenu(targetIds, targetKind, undefined); },
              });
              speakerManageItems.push({
                label: messages.createSpeakerAndAssign,
                onClick: () => {
                  onOpenSpeakerManagementPanelFromMenu();
                },
              });

              items.push({
                label: messages.speakerManagement,
                children: speakerManageItems,
              });
            }

            // 本层显示样式子菜单 | Layer display style submenu
            if (displayStyleControl) {
              const ctxLayer = [...transcriptionLayers, ...translationLayers].find((l) => l.id === ctxMenu.layerId);
              if (ctxLayer) {
                const styleMenuItems = buildLayerStyleMenuItems(
                  ctxLayer.displaySettings,
                  ctxLayer.id,
                  ctxLayer.languageId,
                  ctxLayer.orthographyId,
                  displayStyleControl.orthographies,
                  (patch) => displayStyleControl.onUpdate(ctxMenu.layerId, patch),
                  () => displayStyleControl.onReset(ctxMenu.layerId),
                  displayStyleControl.localFonts,
                  locale,
                );
                items.push({
                  label: messages.layerDisplayStyle,
                  separatorBefore: true,
                  children: styleMenuItems,
                });
              }
            }
            return items;
          })()}
        />
      )}
      {uttOpsMenu && selectedTimelineUnit?.unitId && (
        <ContextMenu
          x={uttOpsMenu.x}
          y={uttOpsMenu.y}
          onClose={onCloseUttOpsMenu}
          items={(() => {
            const id = selectedTimelineUnit.unitId;
            const multiCount = selectedUtteranceIds.size;
            const targetKind = selectedTimelineUnit.kind;
            const targetLayerId = selectedTimelineUnit.layerId;
            if (multiCount > 1) {
              return [
                { label: messages.deleteSegments(multiCount), shortcut: '⌫', danger: true, onClick: () => { runDeleteSelection(id, selectedUtteranceIds, targetKind, targetLayerId); } },
                ...(targetKind === 'segment'
                  ? []
                  : [{ label: messages.mergeSegments(multiCount), onClick: () => { runMergeSelection(selectedUtteranceIds, targetKind, targetLayerId); } }]),
              ];
            }
            return [
              { label: messages.deleteSegment, shortcut: '⌫', danger: true, onClick: () => { runDeleteOne(id, targetKind, targetLayerId); } },
              { label: messages.mergePrevious, shortcut: '⌘⇧M', onClick: () => { runMergePrev(id, targetKind, targetLayerId); } },
              { label: messages.mergeNext, shortcut: '⌘M', onClick: () => { runMergeNext(id, targetKind, targetLayerId); } },
              { label: messages.splitSegment, shortcut: '⌘⇧S', onClick: () => { runSplitAtTime(id, getCurrentTime(), targetKind, targetLayerId); } },
            ];
          })()}
        />
      )}
      <ConfirmDeleteDialog
        locale={locale}
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
          targetLabel={buildNotePopoverTargetLabel()}
          onClose={onCloseNotePopover}
          onAdd={addNote}
          onUpdate={updateNote}
          onDelete={deleteNote}
        />
      )}
    </>
  );
}
