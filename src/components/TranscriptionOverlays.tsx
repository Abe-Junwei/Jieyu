import type { ReactNode } from 'react';
import type { NoteCategory, MultiLangString, LayerDocType, LayerDisplaySettings, OrthographyDocType, UserNoteDocType, LayerUnitDocType } from '../db';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import type { SpeakerFilterOption } from '../hooks/useSpeakerActions';
import type { TimelineUnit, TimelineUnitKind } from '../hooks/transcriptionTypes';
import type { ContextMenuState } from '../pages/TranscriptionPage.UIState';
import { useOptionalLocale } from '../i18n';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { getTranscriptionOverlaysMessages } from '../i18n/messages';
import { getLayerLabelParts } from '../utils/transcriptionFormatters';
import { ContextMenu } from './ContextMenu';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { NotePopover } from './NotePopover';
import { buildTranscriptionUnitContextMenuItems } from './transcription/buildTranscriptionUnitContextMenuItems';
import { buildUttOpsToolbarMenuItems } from './transcription/buildUttOpsToolbarContextMenuItems';
import { buildOrthographyPreviewTextProps, resolveOrthographyRenderPolicy, type LocalFontEntry } from '../utils/layerDisplayStyle';

export interface TranscriptionOverlaysProps {
  ctxMenu: ContextMenuState | null;
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
  onToggleSkipProcessingFromMenu?: (unitId: string, kind: TimelineUnitKind, layerId: string) => void;
  resolveSkipProcessingState?: (unitId: string, layerId: string, kind: TimelineUnitKind) => boolean;
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
    onToggleSkipProcessingFromMenu,
    resolveSkipProcessingState,
    onOpenSpeakerManagementPanelFromMenu = () => {},
    displayStyleControl,
  } = props;

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
          items={buildTranscriptionUnitContextMenuItems({
            ctxMenu,
            locale,
            messages,
            selectedUnitIds,
            units,
            transcriptionLayers,
            translationLayers,
            speakerFilterOptions,
            speakerOptions,
            onAssignSpeakerFromMenu,
            onOpenNoteFromMenu,
            onOpenSpeakerManagementPanelFromMenu,
            runDeleteSelection,
            runMergeSelection,
            runSelectBefore,
            runSelectAfter,
            runDeleteOne,
            runMergePrev,
            runMergeNext,
            runSplitAtTime,
            ...(resolveSelfCertaintyUnitIds ? { resolveSelfCertaintyUnitIds } : {}),
            ...(onSetUnitSelfCertaintyFromMenu ? { onSetUnitSelfCertaintyFromMenu } : {}),
            ...(onToggleSkipProcessingFromMenu ? { onToggleSkipProcessingFromMenu } : {}),
            ...(resolveSkipProcessingState ? { resolveSkipProcessingState } : {}),
            ...(displayStyleControl ? { displayStyleControl } : {}),
          })}
        />
      )}
      {uttOpsMenu && selectedTimelineUnit && selectedTimelineUnit.unitId && (
        <ContextMenu
          x={uttOpsMenu.x}
          y={uttOpsMenu.y}
          onClose={onCloseUttOpsMenu}
          items={buildUttOpsToolbarMenuItems({
            messages,
            selectedUnitIds,
            selectedTimelineUnit,
            transcriptionLayers,
            translationLayers,
            ...(resolveSkipProcessingState ? { resolveSkipProcessingState } : {}),
            runDeleteSelection,
            runMergeSelection,
            runDeleteOne,
            runMergePrev,
            runMergeNext,
            runSplitAtTime,
            getCurrentTime,
          })}
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
