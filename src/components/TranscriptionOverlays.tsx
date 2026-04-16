import type { ReactNode } from 'react';
import type { NoteCategory, MultiLangString, LayerDocType, LayerDisplaySettings, OrthographyDocType, UserNoteDocType, LayerUnitDocType } from '../db';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import type { SpeakerFilterOption } from '../hooks/useSpeakerActions';
import type { TimelineUnit, TimelineUnitKind } from '../hooks/transcriptionTypes';
import { t, useOptionalLocale } from '../i18n';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { getTranscriptionOverlaysMessages } from '../i18n/transcriptionOverlaysMessages';
import { getLayerLabelParts } from '../utils/transcriptionFormatters';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { NotePopover } from './NotePopover';
import { buildLayerStyleMenuItems } from './LayerStyleSubmenu';
import { buildOrthographyPreviewTextProps, resolveOrthographyRenderPolicy, type LocalFontEntry } from '../utils/layerDisplayStyle';

export interface TranscriptionOverlaysProps {
  ctxMenu: { x: number; y: number; unitId: string; layerId: string; unitKind: TimelineUnitKind; splitTime: number; source?: 'timeline' | 'waveform' } | null;
  onCloseCtxMenu: () => void;
  uttOpsMenu: { x: number; y: number } | null;
  onCloseUttOpsMenu: () => void;
  selectedTimelineUnit?: TimelineUnit | null;
  selectedUnitIds: Set<string>;
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
  units: LayerUnitDocType[];
  /** 将右键 target id（含指代型 segment id）解析为可持久化 selfCertainty 的 unit id */
  resolveSelfCertaintyUnitIds?: (unitIds: readonly string[], layerId?: string) => string[];
  getUnitTextForLayer: (utt: LayerUnitDocType, layerId?: string) => string;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  speakerOptions?: Array<{ id: string; name: string }>;
  speakerFilterOptions?: SpeakerFilterOption[];
  onAssignSpeakerFromMenu?: (unitIds: Iterable<string>, kind: TimelineUnitKind, speakerId?: string) => void;
  /** 句段自我确信度（仅 unit）| Unit self-certainty (unit units only) */
  onSetUnitSelfCertaintyFromMenu?: (
    unitIds: Iterable<string>,
    kind: TimelineUnitKind,
    value: UnitSelfCertainty | undefined,
    layerId?: string,
  ) => void;
  onOpenLayerMetadataPanelFromMenu?: (layerId: string) => void;
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
    selectedUnitIds,
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
    units,
    resolveSelfCertaintyUnitIds: resolveSelfCertaintyUnitIds,
    getUnitTextForLayer,
    transcriptionLayers,
    translationLayers,
    speakerOptions = [],
    speakerFilterOptions = [],
    onAssignSpeakerFromMenu = () => {},
    onSetUnitSelfCertaintyFromMenu: onSetUnitSelfCertaintyFromMenu,
    onOpenLayerMetadataPanelFromMenu = () => {},
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
    if (!notePopover) return messages.segment;

    const utt = units.find((u) => u.id === notePopover.uttId);
    const previewLayer = notePopover.layerId
      ? allTextLayers.find((layer) => layer.id === notePopover.layerId)
      : defaultPreviewLayer;
    const uttText = (utt ? getUnitTextForLayer(utt, previewLayer?.id) : '').slice(0, 20);
    const fallbackLabel = messages.segment;

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
            const multiCount = selectedUnitIds.size;
            const targetIds = multiCount > 1 ? Array.from(selectedUnitIds) : [id];
            const targetKind = ctxMenu.unitKind;
            const isSegmentUnitContext = targetKind === 'segment';
            // 与「添加备注」一致：只要提供 handler 即显示；segment id / 宿主 unit id 在点击或 ReadyWorkspace 内统一解析
            const selfCertaintyTargetUnitIds = (resolveSelfCertaintyUnitIds?.(targetIds, ctxMenu.layerId)
              ?? targetIds.filter((uid) => units.some((u) => u.id === uid)));
            const setSelfCertaintyFromMenu = onSetUnitSelfCertaintyFromMenu;
            const isTranscriptionLayerContext = transcriptionLayers.some((layer) => layer.id === ctxMenu.layerId);
            const items: ContextMenuItem[] = multiCount > 1
              ? [
                  { label: messages.deleteSegments(multiCount), shortcut: '⌫', danger: true, onClick: () => { runDeleteSelection(id, selectedUnitIds, targetKind, ctxMenu.layerId); } },
                  ...(isSegmentUnitContext
                    ? []
                    : [{ label: messages.mergeSegments(multiCount), onClick: () => { runMergeSelection(selectedUnitIds, targetKind, ctxMenu.layerId); } }]),
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

            if (setSelfCertaintyFromMenu) {
              const scIds = selfCertaintyTargetUnitIds.length > 0
                ? selfCertaintyTargetUnitIds
                : targetIds;
              items.push({
                label: t(locale, 'transcription.ctxMenu.selfCertainty'),
                separatorBefore: true,
                children: [
                  {
                    label: t(locale, 'transcription.unit.selfCertainty.certain'),
                    onClick: () => { setSelfCertaintyFromMenu(scIds, targetKind, 'certain', ctxMenu.layerId); },
                  },
                  {
                    label: t(locale, 'transcription.unit.selfCertainty.uncertain'),
                    onClick: () => { setSelfCertaintyFromMenu(scIds, targetKind, 'uncertain', ctxMenu.layerId); },
                  },
                  {
                    label: t(locale, 'transcription.unit.selfCertainty.notUnderstood'),
                    onClick: () => { setSelfCertaintyFromMenu(scIds, targetKind, 'not_understood', ctxMenu.layerId); },
                  },
                  {
                    label: t(locale, 'transcription.unit.selfCertainty.clear'),
                    onClick: () => { setSelfCertaintyFromMenu(scIds, targetKind, undefined, ctxMenu.layerId); },
                  },
                ],
              });
            }

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

            const contextLayer = allTextLayers.find((layer) => layer.id === ctxMenu.layerId);
            if (contextLayer) {
              items.push({
                label: contextLayer.layerType === 'translation'
                  ? messages.editTranslationLayerMetadata
                  : messages.editTranscriptionLayerMetadata,
                separatorBefore: true,
                onClick: () => {
                  onOpenLayerMetadataPanelFromMenu(contextLayer.id);
                },
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
            const multiCount = selectedUnitIds.size;
            const targetKind = selectedTimelineUnit.kind;
            const targetLayerId = selectedTimelineUnit.layerId;
            if (multiCount > 1) {
              return [
                { label: messages.deleteSegments(multiCount), shortcut: '⌫', danger: true, onClick: () => { runDeleteSelection(id, selectedUnitIds, targetKind, targetLayerId); } },
                ...(targetKind === 'segment'
                  ? []
                  : [{ label: messages.mergeSegments(multiCount), onClick: () => { runMergeSelection(selectedUnitIds, targetKind, targetLayerId); } }]),
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
