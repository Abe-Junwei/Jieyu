import { useCallback, useEffect, useMemo } from 'react';
import { t, tf, type Locale } from '../i18n';
import type { LayerDisplaySettings, LayerDocType, OrthographyDocType } from '../db';
import type { VerticalReadingGroup } from '../utils/transcriptionVerticalReadingGroups';
import { filterTranslationLayersForVerticalReadingGroup, type VerticalReadingHostLink } from '../utils/verticalReadingHostFilter';
import { buildLaneHeaderInlineDotSeparatedLabel } from '../utils/transcriptionFormatters';
import { buildLayerStyleMenuItems } from '../components/LayerStyleSubmenu';
import { buildLayerOperationMenuItems, type LayerOperationActionType } from '../components/layerOperationMenuItems';
import { type ContextMenuItem } from '../components/ContextMenu';
import {
  pairedReadingMenuText,
  resolvePairedReadingHorizontalBundleKey,
  resolvePairedReadingLayerLabel,
} from '../components/transcriptionTimelineVerticalViewHelpers';
import {
  isPairedReadingLayerCollapsed,
  togglePairedReadingCompactModeForLayer,
  type PairedReadingCompactMode,
  type PairedReadingLayerRole,
} from './useTimelineVisibilityState';

interface PairedReadingDisplayStyleControl {
  orthographies: OrthographyDocType[];
  onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
  onReset: (layerId: string) => void;
  localFonts?: Parameters<typeof buildLayerStyleMenuItems>[7];
}

interface LayerContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  anchorOrigin?: 'top-left' | 'bottom-left';
}

export interface UseTranscriptionTimelineVerticalChromeInput {
  locale: Locale;
  groups: VerticalReadingGroup[];
  activeVerticalReadingGroupId: string | null | undefined;
  activeUnitId: string | undefined;
  sourceLayer: LayerDocType | undefined;
  targetLayer: LayerDocType | undefined;
  translationLayers: LayerDocType[];
  transcriptionLayers: LayerDocType[];
  defaultTranscriptionLayerId: string | undefined;
  layerLinks?: readonly VerticalReadingHostLink[];
  layerIdToHorizontalBundleRootId: ReadonlyMap<string, string>;
  horizontalBundleRootIdsOrdered: string[];
  effectiveAllLayersOrdered: LayerDocType[];
  pairedReadingBundleFilterRootId: string | null;
  setPairedReadingBundleFilterRootId: (next: string | null) => void;
  displayStyleControl?: PairedReadingDisplayStyleControl | undefined;
  compactMode: PairedReadingCompactMode;
  setCompactMode: React.Dispatch<React.SetStateAction<PairedReadingCompactMode>>;
  onFocusLayer: (layerId: string) => void;
  effectiveDeletableLayers: LayerDocType[];
  canOpenTranslationCreate: boolean;
  requestDeleteLayer: (layerId: string) => Promise<void> | void;
  onLayerAction: (action: Exclude<LayerOperationActionType, 'delete'>, layerId: string | undefined) => void;
  setLayerContextMenu: React.Dispatch<React.SetStateAction<LayerContextMenuState | null>>;
}

export interface UseTranscriptionTimelineVerticalChromeResult {
  visibleGroups: VerticalReadingGroup[];
  orderedDistinctBundleKeys: string[];
  bundleOrdinalByKey: Map<string, number>;
  bundleFilterMenuItems: ContextMenuItem[];
  bundleFilterButtonTitle: string;
  sourceHeaderContent: string;
  pairedReadingHeaderOrthographies: OrthographyDocType[];
  resolvePairedReadingHeaderContentForLayer: (layer: LayerDocType | undefined, fallbackLabel: string) => string;
  headerTargetLayers: LayerDocType[];
  pairedReadingLayerStyleMenuItems: ContextMenuItem[];
  buildPairedReadingLayerHeaderMenuItems: (layer: LayerDocType | undefined, headerLabel: string) => ContextMenuItem[];
  pairedReadingHeaderMenuItems: { source: ContextMenuItem[] };
  openPairedReadingMenuAtPointer: (event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => void;
  togglePairedReadingMenuFromButton: (event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => void;
}

export function useTranscriptionTimelineVerticalChrome(
  input: UseTranscriptionTimelineVerticalChromeInput,
): UseTranscriptionTimelineVerticalChromeResult {
  const {
    locale,
    groups,
    activeVerticalReadingGroupId,
    activeUnitId,
    sourceLayer,
    targetLayer,
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    layerLinks = [],
    layerIdToHorizontalBundleRootId,
    horizontalBundleRootIdsOrdered,
    effectiveAllLayersOrdered,
    pairedReadingBundleFilterRootId,
    setPairedReadingBundleFilterRootId,
    displayStyleControl,
    compactMode,
    setCompactMode,
    onFocusLayer,
    effectiveDeletableLayers,
    canOpenTranslationCreate,
    requestDeleteLayer,
    onLayerAction,
    setLayerContextMenu,
  } = input;

  const verticalReadingGroupHorizontalBundleKeysPresent = useMemo(() => {
    const present = new Set<string>();
    for (const g of groups) {
      present.add(resolvePairedReadingHorizontalBundleKey(g, layerIdToHorizontalBundleRootId, sourceLayer?.id));
    }
    return present;
  }, [groups, layerIdToHorizontalBundleRootId, sourceLayer?.id]);

  const orderedDistinctBundleKeys = useMemo(() => {
    const ordered = horizontalBundleRootIdsOrdered.filter((id) => verticalReadingGroupHorizontalBundleKeysPresent.has(id));
    const orphan = [...verticalReadingGroupHorizontalBundleKeysPresent]
      .filter((k) => k.startsWith('__cmp_group:'))
      .filter((k) => !ordered.includes(k))
      .sort();
    return [...ordered, ...orphan];
  }, [verticalReadingGroupHorizontalBundleKeysPresent, horizontalBundleRootIdsOrdered]);

  const bundleOrdinalByKey = useMemo(() => {
    const map = new Map<string, number>();
    let nextIndex = 1;
    for (const key of orderedDistinctBundleKeys) {
      map.set(key, nextIndex);
      nextIndex += 1;
    }
    return map;
  }, [orderedDistinctBundleKeys]);

  const visibleGroups = useMemo(() => {
    if (pairedReadingBundleFilterRootId == null) return groups;
    return groups.filter(
      (g) => resolvePairedReadingHorizontalBundleKey(g, layerIdToHorizontalBundleRootId, sourceLayer?.id)
        === pairedReadingBundleFilterRootId,
    );
  }, [pairedReadingBundleFilterRootId, groups, layerIdToHorizontalBundleRootId, sourceLayer?.id]);

  useEffect(() => {
    if (orderedDistinctBundleKeys.length <= 1) {
      setPairedReadingBundleFilterRootId(null);
      return;
    }
    if (pairedReadingBundleFilterRootId != null && !orderedDistinctBundleKeys.includes(pairedReadingBundleFilterRootId)) {
      setPairedReadingBundleFilterRootId(null);
    }
  }, [pairedReadingBundleFilterRootId, orderedDistinctBundleKeys, setPairedReadingBundleFilterRootId]);

  const bundleFilterMenuItems = useMemo((): ContextMenuItem[] => {
    if (orderedDistinctBundleKeys.length <= 1) return [];
    const bundleLabelText = t(locale, 'transcription.pairedReading.bundleLabel');
    const items: ContextMenuItem[] = [
      {
        label: t(locale, 'transcription.pairedReading.bundleFilterAll'),
        selectionState: pairedReadingBundleFilterRootId == null ? 'selected' : 'unselected',
        selectionVariant: 'check',
        onClick: () => setPairedReadingBundleFilterRootId(null),
      },
    ];
    for (const bundleKey of orderedDistinctBundleKeys) {
      const ord = bundleOrdinalByKey.get(bundleKey) ?? 0;
      const rootLayer = bundleKey.startsWith('__cmp_group:')
        ? undefined
        : effectiveAllLayersOrdered.find((l) => l.id === bundleKey);
      const name = rootLayer
        ? resolvePairedReadingLayerLabel(rootLayer, locale, `${bundleLabelText} ${ord}`)
        : tf(locale, 'transcription.pairedReading.bundleFilterFallbackItem', { ordinal: ord });
      items.push({
        label: name,
        selectionState: pairedReadingBundleFilterRootId === bundleKey ? 'selected' : 'unselected',
        selectionVariant: 'check',
        onClick: () => setPairedReadingBundleFilterRootId(bundleKey),
      });
    }
    return items;
  }, [bundleOrdinalByKey, pairedReadingBundleFilterRootId, effectiveAllLayersOrdered, locale, orderedDistinctBundleKeys, setPairedReadingBundleFilterRootId]);

  const bundleFilterButtonTitle = useMemo(() => {
    if (orderedDistinctBundleKeys.length <= 1) return '';
    if (pairedReadingBundleFilterRootId == null) {
      return t(locale, 'transcription.pairedReading.bundleFilterTitleAll');
    }
    const ord = bundleOrdinalByKey.get(pairedReadingBundleFilterRootId) ?? 0;
    const rootLayer = pairedReadingBundleFilterRootId.startsWith('__cmp_group:')
      ? undefined
      : effectiveAllLayersOrdered.find((l) => l.id === pairedReadingBundleFilterRootId);
    const name = rootLayer
      ? resolvePairedReadingLayerLabel(rootLayer, locale, `${t(locale, 'transcription.pairedReading.bundleLabel')} ${ord}`)
      : tf(locale, 'transcription.pairedReading.bundleFilterFallbackItem', { ordinal: ord });
    return tf(locale, 'transcription.pairedReading.bundleFilterTitleOne', { name });
  }, [bundleOrdinalByKey, pairedReadingBundleFilterRootId, effectiveAllLayersOrdered, locale, orderedDistinctBundleKeys]);

  const sourceHeaderLabel = useMemo(
    () => resolvePairedReadingLayerLabel(sourceLayer, locale, t(locale, 'transcription.pairedReading.sourceHeader')),
    [locale, sourceLayer],
  );

  const pairedReadingHeaderOrthographies = displayStyleControl?.orthographies ?? [];

  const resolvePairedReadingHeaderContentForLayer = useCallback((layer: LayerDocType | undefined, fallbackLabel: string): string => {
    if (!layer) return fallbackLabel;
    const inline = buildLaneHeaderInlineDotSeparatedLabel(layer, locale, pairedReadingHeaderOrthographies);
    const trimmed = inline.trim();
    return trimmed.length > 0 ? trimmed : fallbackLabel;
  }, [pairedReadingHeaderOrthographies, locale]);

  const sourceHeaderContent = useMemo(
    () => resolvePairedReadingHeaderContentForLayer(sourceLayer, sourceHeaderLabel),
    [resolvePairedReadingHeaderContentForLayer, sourceHeaderLabel, sourceLayer],
  );

  const activeVerticalReadingGroupForHeader = useMemo(() => {
    if (groups.length === 0) return undefined;
    if (activeVerticalReadingGroupId) {
      const exact = groups.find((g) => g.id === activeVerticalReadingGroupId);
      if (exact) return exact;
    }
    if (activeUnitId) {
      const byUnit = groups.find((g) => (
        g.sourceItems.some((item) => item.unitId === activeUnitId)
        || g.targetItems.some((item) => item.anchorUnitIds.includes(activeUnitId))
      ));
      if (byUnit) return byUnit;
    }
    return groups[0];
  }, [activeVerticalReadingGroupId, activeUnitId, groups]);

  const headerTargetLayers = useMemo(() => {
    if (translationLayers.length === 0) return [] as LayerDocType[];
    const fromGroup = activeVerticalReadingGroupForHeader
      ? filterTranslationLayersForVerticalReadingGroup(
          activeVerticalReadingGroupForHeader,
          translationLayers,
          transcriptionLayers,
          defaultTranscriptionLayerId,
          sourceLayer?.id,
          layerLinks,
        )
      : [];
    if (activeVerticalReadingGroupForHeader && fromGroup.length === 0) return [];
    const resolved = fromGroup.length > 0
      ? fromGroup
      : (targetLayer ? [targetLayer] : (translationLayers[0] ? [translationLayers[0]] : []));
    if (!targetLayer) return resolved;
    const preferred = resolved.find((l) => l.id === targetLayer.id);
    if (!preferred) return resolved;
    return [preferred, ...resolved.filter((l) => l.id !== preferred.id)];
  }, [
    activeVerticalReadingGroupForHeader,
    defaultTranscriptionLayerId,
    layerLinks,
    sourceLayer?.id,
    targetLayer,
    transcriptionLayers,
    translationLayers,
  ]);

  const pairedReadingLayerStyleMenuItems = useMemo((): ContextMenuItem[] => {
    if (!displayStyleControl || !sourceLayer) return [];
    const sourceItems = buildLayerStyleMenuItems(
      sourceLayer.displaySettings,
      sourceLayer.id,
      sourceLayer.languageId,
      sourceLayer.orthographyId,
      displayStyleControl.orthographies,
      (patch) => displayStyleControl.onUpdate(sourceLayer.id, patch),
      () => displayStyleControl.onReset(sourceLayer.id),
      displayStyleControl.localFonts,
      locale,
    );
    const categories: ContextMenuItem[] = [
      { label: sourceHeaderLabel, variant: 'category', children: sourceItems },
    ];
    for (const tl of headerTargetLayers) {
      const tlLabel = resolvePairedReadingLayerLabel(tl, locale, t(locale, 'transcription.pairedReading.translationHeader'));
      const tlMenu = buildLayerStyleMenuItems(
        tl.displaySettings,
        tl.id,
        tl.languageId,
        tl.orthographyId,
        displayStyleControl.orthographies,
        (patch) => displayStyleControl.onUpdate(tl.id, patch),
        () => displayStyleControl.onReset(tl.id),
        displayStyleControl.localFonts,
        locale,
      );
      categories.push({ label: tlLabel, variant: 'category', children: tlMenu });
    }
    return categories;
  }, [displayStyleControl, headerTargetLayers, locale, sourceHeaderLabel, sourceLayer]);

  const buildPairedReadingLayerHeaderMenuItems = useCallback((layer: LayerDocType | undefined, headerLabel: string): ContextMenuItem[] => {
    const isSourceHeaderLayer = layer?.id != null && layer.id === sourceLayer?.id;
    const layerRole: PairedReadingLayerRole = isSourceHeaderLayer ? 'source' : 'target';
    const isLayerCollapsed = isPairedReadingLayerCollapsed(compactMode, layerRole);
    const toggleLayerCollapsed = () => {
      if (!layer?.id) return;
      setCompactMode((prev) => togglePairedReadingCompactModeForLayer(prev, layerRole));
    };

    const items: ContextMenuItem[] = [
      {
        label: tf(locale, 'transcription.pairedReading.rowRailFocusLayer', { layer: headerLabel }),
        disabled: !layer?.id,
        onClick: () => {
          if (layer?.id) onFocusLayer(layer.id);
        },
      },
      {
        label: pairedReadingMenuText(locale, '视图', 'View'),
        variant: 'category',
        separatorBefore: true,
        children: [
          {
            label: t(locale, 'transcription.pairedReading.allColumns'),
            selectionState: compactMode === 'both' ? 'selected' : 'unselected',
            selectionVariant: 'check',
            onClick: () => setCompactMode('both'),
          },
          {
            label: t(locale, 'transcription.pairedReading.sourceOnly'),
            selectionState: compactMode === 'source' ? 'selected' : 'unselected',
            selectionVariant: 'check',
            onClick: () => setCompactMode('source'),
          },
          {
            label: t(locale, 'transcription.pairedReading.translationOnly'),
            selectionState: compactMode === 'target' ? 'selected' : 'unselected',
            selectionVariant: 'check',
            onClick: () => setCompactMode('target'),
          },
          {
            label: pairedReadingMenuText(
              locale,
              isLayerCollapsed ? '展开该层' : '折叠该层',
              isLayerCollapsed ? 'Expand layer' : 'Collapse layer',
            ),
            separatorBefore: true,
            disabled: !layer?.id,
            onClick: toggleLayerCollapsed,
          },
        ],
      },
    ];

    if (displayStyleControl && layer) {
      items.push({
        label: t(locale, 'transcription.pairedReading.layerDisplayStyles'),
        variant: 'category',
        children: buildLayerStyleMenuItems(
          layer.displaySettings,
          layer.id,
          layer.languageId,
          layer.orthographyId,
          displayStyleControl.orthographies,
          (patch) => displayStyleControl.onUpdate(layer.id, patch),
          () => displayStyleControl.onReset(layer.id),
          displayStyleControl.localFonts,
          locale,
        ),
      });
    }

    items.push({
      label: pairedReadingMenuText(locale, '层操作', 'Layer operations'),
      variant: 'category',
      children: buildLayerOperationMenuItems({
        layer,
        deletableLayers: effectiveDeletableLayers,
        canOpenTranslationCreate,
        labels: {
          editLayerMetadata: pairedReadingMenuText(locale, '编辑该层元信息', 'Edit layer metadata'),
          createTranscription: pairedReadingMenuText(locale, '新建转写层', 'Create transcription layer'),
          createTranslation: pairedReadingMenuText(locale, '新建翻译层', 'Create translation layer'),
          deleteCurrentLayer: pairedReadingMenuText(locale, '删除当前层', 'Delete current layer'),
        },
        onAction: (action, layerId) => {
          if (action === 'delete') {
            if (!layerId) return;
            void requestDeleteLayer(layerId);
            return;
          }
          onLayerAction(action, layerId);
        },
      }),
    });

    return items;
  }, [
    canOpenTranslationCreate,
    compactMode,
    displayStyleControl,
    effectiveDeletableLayers,
    locale,
    onFocusLayer,
    onLayerAction,
    requestDeleteLayer,
    setCompactMode,
    sourceLayer?.id,
  ]);

  const pairedReadingHeaderMenuItems = useMemo(() => ({
    source: buildPairedReadingLayerHeaderMenuItems(sourceLayer, sourceHeaderContent),
  }), [buildPairedReadingLayerHeaderMenuItems, sourceHeaderContent, sourceLayer]);

  const openPairedReadingMenuAtPointer = useCallback((event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setLayerContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      anchorOrigin: 'top-left',
    });
  }, [setLayerContextMenu]);

  const togglePairedReadingMenuFromButton = useCallback((event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
    if (items.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setLayerContextMenu((prev) => {
      const next = {
        x: rect.left,
        y: rect.bottom + 4,
        items,
        anchorOrigin: 'bottom-left' as const,
      };
      if (
        prev
        && prev.items === items
        && Math.abs(prev.x - next.x) < 6
        && Math.abs(prev.y - next.y) < 6
      ) {
        return null;
      }
      return next;
    });
  }, [setLayerContextMenu]);

  return {
    visibleGroups,
    orderedDistinctBundleKeys,
    bundleOrdinalByKey,
    bundleFilterMenuItems,
    bundleFilterButtonTitle,
    sourceHeaderContent,
    pairedReadingHeaderOrthographies,
    resolvePairedReadingHeaderContentForLayer,
    headerTargetLayers,
    pairedReadingLayerStyleMenuItems,
    buildPairedReadingLayerHeaderMenuItems,
    pairedReadingHeaderMenuItems,
    openPairedReadingMenuAtPointer,
    togglePairedReadingMenuFromButton,
  };
}
