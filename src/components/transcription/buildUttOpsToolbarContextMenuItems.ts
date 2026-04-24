import type { LayerDocType } from '../../db';
import type { TimelineUnit, TimelineUnitKind } from '../../hooks/transcriptionTypes';
import type { TranscriptionOverlaysMessages } from '../../i18n/messages';
import type { ContextMenuItem } from '../ContextMenu';

export type BuildUttOpsToolbarMenuItemsInput = {
  messages: TranscriptionOverlaysMessages;
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: TimelineUnit;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  resolveSkipProcessingState?: (unitId: string, layerId: string, kind: TimelineUnitKind) => boolean;
  runDeleteSelection: (anchorId: string, selectedIds: Set<string>, unitKind: TimelineUnitKind, layerId: string) => void;
  runMergeSelection: (selectedIds: Set<string>, unitKind: TimelineUnitKind, layerId: string) => void;
  runDeleteOne: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runMergePrev: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runMergeNext: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runSplitAtTime: (id: string, splitTime: number, unitKind: TimelineUnitKind, layerId: string) => void;
  getCurrentTime: () => number;
};

function isTranslationLayerId(layerId: string, translationLayers: LayerDocType[]): boolean {
  return translationLayers.some((layer) => layer.id === layerId);
}

function isTranscriptionLayerId(layerId: string, transcriptionLayers: LayerDocType[]): boolean {
  return transcriptionLayers.some((layer) => layer.id === layerId);
}

/** 工具栏「句段操作」菜单：与全局语段菜单一致，翻译层裁剪结构合并项。 */
export function buildUttOpsToolbarMenuItems(input: BuildUttOpsToolbarMenuItemsInput): ContextMenuItem[] {
  const {
    messages,
    selectedUnitIds,
    selectedTimelineUnit,
    transcriptionLayers,
    translationLayers,
    resolveSkipProcessingState,
    runDeleteSelection,
    runMergeSelection,
    runDeleteOne,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    getCurrentTime,
  } = input;

  const id = selectedTimelineUnit.unitId;
  const multiCount = selectedUnitIds.size;
  const targetKind = selectedTimelineUnit.kind;
  const targetLayerId = selectedTimelineUnit.layerId;
  const isTranslation = isTranslationLayerId(targetLayerId, translationLayers);
  const anchorSkipProcessing = resolveSkipProcessingState?.(id, targetLayerId, targetKind) === true;
  const restrictSkippedSegmentToolbar = selectedTimelineUnit.kind === 'segment'
    && isTranscriptionLayerId(targetLayerId, transcriptionLayers)
    && anchorSkipProcessing;
  const selectionIncludesSkippedForMerge = multiCount > 1
    && [...selectedUnitIds].some((uid) => resolveSkipProcessingState?.(uid, targetLayerId, targetKind) === true);
  const showMultiBatchMerge = !isTranslation && !selectionIncludesSkippedForMerge;
  const showPairMergeStructuralActions = !isTranslation && !restrictSkippedSegmentToolbar;
  const showSplitAction = !restrictSkippedSegmentToolbar;

  if (multiCount > 1) {
    return [
      {
        label: messages.deleteSegments(multiCount),
        shortcut: '⌫',
        danger: true,
        onClick: () => { runDeleteSelection(id, selectedUnitIds, targetKind, targetLayerId); },
      },
      ...(showMultiBatchMerge
        ? [{
            label: messages.mergeSegments(multiCount),
            onClick: () => { runMergeSelection(selectedUnitIds, targetKind, targetLayerId); },
          }]
        : []),
    ];
  }

  return [
    {
      label: messages.deleteSegment,
      shortcut: '⌫',
      danger: true,
      onClick: () => { runDeleteOne(id, targetKind, targetLayerId); },
    },
    ...(showPairMergeStructuralActions
      ? [
          {
            label: messages.mergePrevious,
            shortcut: '⌘⇧M',
            onClick: () => { runMergePrev(id, targetKind, targetLayerId); },
          },
          {
            label: messages.mergeNext,
            shortcut: '⌘M',
            onClick: () => { runMergeNext(id, targetKind, targetLayerId); },
          },
        ]
      : []),
    ...(showSplitAction
      ? [{
          label: messages.splitSegment,
          shortcut: '⌘⇧S',
          onClick: () => { runSplitAtTime(id, getCurrentTime(), targetKind, targetLayerId); },
        }]
      : []),
  ];
}
