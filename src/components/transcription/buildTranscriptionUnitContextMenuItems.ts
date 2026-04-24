import type { LayerDocType, LayerDisplaySettings, OrthographyDocType, LayerUnitDocType } from '../../db';
import type { SpeakerFilterOption } from '../../hooks/useSpeakerActions';
import type { TimelineUnitKind } from '../../hooks/transcriptionTypes';
import type { ContextMenuState } from '../../pages/TranscriptionPage.UIState';
import type { TranscriptionOverlaysMessages } from '../../i18n/messages';
import type { Locale } from '../../i18n';
import { t } from '../../i18n';
import type { ContextMenuItem } from '../ContextMenu';
import { buildLayerStyleMenuItems } from '../LayerStyleSubmenu';
import type { UnitSelfCertainty } from '../../utils/unitSelfCertainty';
import type { LocalFontEntry } from '../../utils/layerDisplayStyle';

export type BuildTranscriptionUnitContextMenuItemsInput = {
  ctxMenu: ContextMenuState;
  locale: Locale;
  messages: TranscriptionOverlaysMessages;
  selectedUnitIds: Set<string>;
  units: LayerUnitDocType[];
  resolveSelfCertaintyUnitIds?: (unitIds: readonly string[], layerId?: string) => string[];
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  speakerFilterOptions: SpeakerFilterOption[];
  speakerOptions: Array<{ id: string; name: string }>;
  onAssignSpeakerFromMenu: (unitIds: Iterable<string>, kind: TimelineUnitKind, speakerId?: string) => void;
  onSetUnitSelfCertaintyFromMenu?: (
    unitIds: Iterable<string>,
    kind: TimelineUnitKind,
    value: UnitSelfCertainty | undefined,
    layerId?: string,
  ) => void;
  onToggleSkipProcessingFromMenu?: (unitId: string, kind: TimelineUnitKind, layerId: string) => void;
  resolveSkipProcessingState?: (unitId: string, layerId: string, kind: TimelineUnitKind) => boolean;
  onOpenNoteFromMenu: (x: number, y: number, uttId: string, layerId?: string, scope?: 'timeline' | 'waveform') => void;
  onOpenSpeakerManagementPanelFromMenu: () => void;
  runDeleteSelection: (anchorId: string, selectedIds: Set<string>, unitKind: TimelineUnitKind, layerId: string) => void;
  runMergeSelection: (selectedIds: Set<string>, unitKind: TimelineUnitKind, layerId: string) => void;
  runSelectBefore: (id: string) => void;
  runSelectAfter: (id: string) => void;
  runDeleteOne: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runMergePrev: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runMergeNext: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runSplitAtTime: (id: string, splitTime: number, unitKind: TimelineUnitKind, layerId: string) => void;
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
};

function isTranscriptionLayerContext(
  layerId: string,
  transcriptionLayers: LayerDocType[],
): boolean {
  return transcriptionLayers.some((layer) => layer.id === layerId);
}

export function buildTranscriptionUnitContextMenuItems(input: BuildTranscriptionUnitContextMenuItemsInput): ContextMenuItem[] {
  const {
    ctxMenu,
    locale,
    messages,
    selectedUnitIds,
    units,
    resolveSelfCertaintyUnitIds,
    transcriptionLayers,
    translationLayers,
    speakerFilterOptions,
    speakerOptions,
    onAssignSpeakerFromMenu,
    onSetUnitSelfCertaintyFromMenu,
    onToggleSkipProcessingFromMenu,
    resolveSkipProcessingState,
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
    displayStyleControl,
  } = input;

  const id = ctxMenu.unitId;
  const multiCount = selectedUnitIds.size;
  const targetIds = multiCount > 1 ? Array.from(selectedUnitIds) : [id];
  const targetKind = ctxMenu.unitKind;
  const isSegmentUnitContext = targetKind === 'segment';
  const isSkipProcessing = resolveSkipProcessingState?.(id, ctxMenu.layerId, targetKind) === true;
  const isTranslation = ctxMenu.layerType === 'translation';
  const isWaveformSurface = ctxMenu.menuSurface === 'waveform-region';
  const isTranscriptionLayer = isTranscriptionLayerContext(ctxMenu.layerId, transcriptionLayers);
  /** 单选：转写句段且已跳过处理 — 仅允许删除、备注、取消跳过与拖边界调范围（无菜单入口）。 */
  const restrictSkippedSegmentMenuActions = isSegmentUnitContext && isTranscriptionLayer && isSkipProcessing;
  /** 多选：选区内任一语段为跳过处理时，禁止会「包含」跳过段的批量合并。 */
  const selectionIncludesSkippedForMerge = multiCount > 1
    && Array.from(selectedUnitIds).some((uid) => resolveSkipProcessingState?.(uid, ctxMenu.layerId, targetKind) === true);

  const selfCertaintyTargetUnitIds = isSegmentUnitContext
    ? targetIds
    : (resolveSelfCertaintyUnitIds?.(targetIds, ctxMenu.layerId)
      ?? targetIds.filter((uid) => units.some((u) => u.id === uid)));

  const showSelectBeforeAfter = !isSegmentUnitContext && !isTranslation && !isWaveformSurface;
  const showMultiBatchMerge = !isTranslation && !selectionIncludesSkippedForMerge;
  const showPairMergeStructuralActions = !isTranslation && !restrictSkippedSegmentMenuActions;
  const showSelfCertainty = Boolean(onSetUnitSelfCertaintyFromMenu) && !isTranslation && !restrictSkippedSegmentMenuActions && !isWaveformSurface;
  const showSkipToggle = Boolean(onToggleSkipProcessingFromMenu) && isSegmentUnitContext && isTranscriptionLayer;
  const showSpeakerBlock = isTranscriptionLayer && !restrictSkippedSegmentMenuActions && !isWaveformSurface;
  /** 「从当前位置拆分」仅在波形 surface 的句段（segment）语境出现；时间轴文本区不提供该入口。 */
  const showSplitAction = isWaveformSurface && isSegmentUnitContext && !isTranslation && !restrictSkippedSegmentMenuActions;

  const recentSpeakerOptions = speakerFilterOptions
    .sort((left, right) => right.count - left.count)
    .slice(0, 3)
    .map((option) => ({ id: option.key, name: option.name }));
  const fullSpeakerOptions = speakerOptions.length > 0 ? speakerOptions : recentSpeakerOptions;

  const items: ContextMenuItem[] = multiCount > 1
    ? [
        { label: messages.deleteSegments(multiCount), shortcut: '⌫', danger: true, onClick: () => { runDeleteSelection(id, selectedUnitIds, targetKind, ctxMenu.layerId); } },
        ...(showMultiBatchMerge
          ? [{ label: messages.mergeSegments(multiCount), onClick: () => { runMergeSelection(selectedUnitIds, targetKind, ctxMenu.layerId); } }]
          : []),
        ...(showSelectBeforeAfter
          ? [
              { label: messages.selectBeforeAll, shortcut: '⇧Home', onClick: () => { runSelectBefore(id); } },
              { label: messages.selectAfterAll, shortcut: '⇧End', onClick: () => { runSelectAfter(id); } },
            ]
          : []),
      ]
    : [
        { label: messages.deleteSegment, shortcut: '⌫', danger: true, onClick: () => { runDeleteOne(id, targetKind, ctxMenu.layerId); } },
        ...(showPairMergeStructuralActions
          ? [
              { label: messages.mergePrevious, shortcut: '⌘⇧M', onClick: () => { runMergePrev(id, targetKind, ctxMenu.layerId); } },
              { label: messages.mergeNext, shortcut: '⌘M', onClick: () => { runMergeNext(id, targetKind, ctxMenu.layerId); } },
            ]
          : []),
        ...(showSplitAction
          ? [{
              label: messages.splitFromCurrent,
              shortcut: '⌘⇧S',
              onClick: () => { runSplitAtTime(id, ctxMenu.splitTime, targetKind, ctxMenu.layerId); },
            }]
          : []),
        ...(showSkipToggle
          ? [{
              label: isSkipProcessing
                ? t(locale, 'transcription.wave.unskipProcessing')
                : t(locale, 'transcription.wave.skipProcessing'),
              onClick: () => { onToggleSkipProcessingFromMenu!(id, targetKind, ctxMenu.layerId); },
            }]
          : []),
        ...(showSelectBeforeAfter
          ? [
              { label: messages.selectBeforeAll, shortcut: '⇧Home', onClick: () => { runSelectBefore(id); } },
              { label: messages.selectAfterAll, shortcut: '⇧End', onClick: () => { runSelectAfter(id); } },
            ]
          : []),
        { label: messages.addNote, shortcut: '⌘⇧N', onClick: () => { onOpenNoteFromMenu(ctxMenu.x, ctxMenu.y, id, ctxMenu.layerId, ctxMenu.source ?? 'timeline'); } },
      ];

  if (showSelfCertainty && onSetUnitSelfCertaintyFromMenu) {
    const setSelfCertaintyFromMenu = onSetUnitSelfCertaintyFromMenu;
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

  if (showSpeakerBlock) {
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

  if (displayStyleControl && !isWaveformSurface) {
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
}
