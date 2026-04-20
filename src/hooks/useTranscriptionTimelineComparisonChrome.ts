import { useCallback, useEffect, useMemo } from 'react';
import { t, tf, type Locale } from '../i18n';
import type { LayerDisplaySettings, LayerDocType, OrthographyDocType } from '../db';
import type { ComparisonGroup } from '../utils/transcriptionComparisonGroups';
import { filterTranslationLayersForComparisonGroup, type ComparisonHostLink } from '../utils/comparisonHostFilter';
import { buildLaneHeaderInlineDotSeparatedLabel } from '../utils/transcriptionFormatters';
import { buildLayerStyleMenuItems } from '../components/LayerStyleSubmenu';
import { buildLayerOperationMenuItems, type LayerOperationActionType } from '../components/layerOperationMenuItems';
import { type ContextMenuItem } from '../components/ContextMenu';
import {
  comparisonMenuText,
  resolveComparisonHorizontalBundleKey,
  resolveComparisonLayerLabel,
} from '../components/transcriptionTimelineComparisonHelpers';
import {
  isComparisonLayerCollapsed,
  toggleComparisonCompactModeForLayer,
  type ComparisonCompactMode,
  type ComparisonLayerRole,
} from './useTimelineVisibilityState';

interface ComparisonDisplayStyleControl {
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

export interface UseTranscriptionTimelineComparisonChromeInput {
  locale: Locale;
  groups: ComparisonGroup[];
  activeComparisonGroupId: string | null | undefined;
  activeUnitId: string | undefined;
  sourceLayer: LayerDocType | undefined;
  targetLayer: LayerDocType | undefined;
  translationLayers: LayerDocType[];
  transcriptionLayers: LayerDocType[];
  defaultTranscriptionLayerId: string | undefined;
  layerLinks?: readonly ComparisonHostLink[];
  layerIdToHorizontalBundleRootId: ReadonlyMap<string, string>;
  horizontalBundleRootIdsOrdered: string[];
  effectiveAllLayersOrdered: LayerDocType[];
  comparisonBundleFilterRootId: string | null;
  setComparisonBundleFilterRootId: (next: string | null) => void;
  displayStyleControl?: ComparisonDisplayStyleControl | undefined;
  compactMode: ComparisonCompactMode;
  setCompactMode: React.Dispatch<React.SetStateAction<ComparisonCompactMode>>;
  onFocusLayer: (layerId: string) => void;
  effectiveDeletableLayers: LayerDocType[];
  canOpenTranslationCreate: boolean;
  requestDeleteLayer: (layerId: string) => Promise<void> | void;
  onLayerAction: (action: Exclude<LayerOperationActionType, 'delete'>, layerId: string | undefined) => void;
  setLayerContextMenu: React.Dispatch<React.SetStateAction<LayerContextMenuState | null>>;
}

export interface UseTranscriptionTimelineComparisonChromeResult {
  visibleGroups: ComparisonGroup[];
  orderedDistinctBundleKeys: string[];
  bundleOrdinalByKey: Map<string, number>;
  bundleFilterMenuItems: ContextMenuItem[];
  bundleFilterButtonTitle: string;
  sourceHeaderContent: string;
  comparisonHeaderOrthographies: OrthographyDocType[];
  resolveComparisonHeaderContentForLayer: (layer: LayerDocType | undefined, fallbackLabel: string) => string;
  headerTargetLayers: LayerDocType[];
  comparisonStyleMenuItems: ContextMenuItem[];
  buildComparisonHeaderMenuItems: (layer: LayerDocType | undefined, headerLabel: string) => ContextMenuItem[];
  comparisonHeaderMenuItems: { source: ContextMenuItem[] };
  openComparisonMenuAtPointer: (event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => void;
  toggleComparisonMenuFromButton: (event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => void;
}

export function useTranscriptionTimelineComparisonChrome(
  input: UseTranscriptionTimelineComparisonChromeInput,
): UseTranscriptionTimelineComparisonChromeResult {
  const {
    locale,
    groups,
    activeComparisonGroupId,
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
    comparisonBundleFilterRootId,
    setComparisonBundleFilterRootId,
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

  const comparisonGroupHorizontalBundleKeysPresent = useMemo(() => {
    const present = new Set<string>();
    for (const g of groups) {
      present.add(resolveComparisonHorizontalBundleKey(g, layerIdToHorizontalBundleRootId, sourceLayer?.id));
    }
    return present;
  }, [groups, layerIdToHorizontalBundleRootId, sourceLayer?.id]);

  const orderedDistinctBundleKeys = useMemo(() => {
    const ordered = horizontalBundleRootIdsOrdered.filter((id) => comparisonGroupHorizontalBundleKeysPresent.has(id));
    const orphan = [...comparisonGroupHorizontalBundleKeysPresent]
      .filter((k) => k.startsWith('__cmp_group:'))
      .filter((k) => !ordered.includes(k))
      .sort();
    return [...ordered, ...orphan];
  }, [comparisonGroupHorizontalBundleKeysPresent, horizontalBundleRootIdsOrdered]);

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
    if (comparisonBundleFilterRootId == null) return groups;
    return groups.filter(
      (g) => resolveComparisonHorizontalBundleKey(g, layerIdToHorizontalBundleRootId, sourceLayer?.id)
        === comparisonBundleFilterRootId,
    );
  }, [comparisonBundleFilterRootId, groups, layerIdToHorizontalBundleRootId, sourceLayer?.id]);

  useEffect(() => {
    if (orderedDistinctBundleKeys.length <= 1) {
      setComparisonBundleFilterRootId(null);
      return;
    }
    if (comparisonBundleFilterRootId != null && !orderedDistinctBundleKeys.includes(comparisonBundleFilterRootId)) {
      setComparisonBundleFilterRootId(null);
    }
  }, [comparisonBundleFilterRootId, orderedDistinctBundleKeys, setComparisonBundleFilterRootId]);

  const bundleFilterMenuItems = useMemo((): ContextMenuItem[] => {
    if (orderedDistinctBundleKeys.length <= 1) return [];
    const bundleLabelText = t(locale, 'transcription.comparison.bundleLabel');
    const items: ContextMenuItem[] = [
      {
        label: t(locale, 'transcription.comparison.bundleFilterAll'),
        selectionState: comparisonBundleFilterRootId == null ? 'selected' : 'unselected',
        selectionVariant: 'check',
        onClick: () => setComparisonBundleFilterRootId(null),
      },
    ];
    for (const bundleKey of orderedDistinctBundleKeys) {
      const ord = bundleOrdinalByKey.get(bundleKey) ?? 0;
      const rootLayer = bundleKey.startsWith('__cmp_group:')
        ? undefined
        : effectiveAllLayersOrdered.find((l) => l.id === bundleKey);
      const name = rootLayer
        ? resolveComparisonLayerLabel(rootLayer, locale, `${bundleLabelText} ${ord}`)
        : tf(locale, 'transcription.comparison.bundleFilterFallbackItem', { ordinal: ord });
      items.push({
        label: name,
        selectionState: comparisonBundleFilterRootId === bundleKey ? 'selected' : 'unselected',
        selectionVariant: 'check',
        onClick: () => setComparisonBundleFilterRootId(bundleKey),
      });
    }
    return items;
  }, [bundleOrdinalByKey, comparisonBundleFilterRootId, effectiveAllLayersOrdered, locale, orderedDistinctBundleKeys, setComparisonBundleFilterRootId]);

  const bundleFilterButtonTitle = useMemo(() => {
    if (orderedDistinctBundleKeys.length <= 1) return '';
    if (comparisonBundleFilterRootId == null) {
      return t(locale, 'transcription.comparison.bundleFilterTitleAll');
    }
    const ord = bundleOrdinalByKey.get(comparisonBundleFilterRootId) ?? 0;
    const rootLayer = comparisonBundleFilterRootId.startsWith('__cmp_group:')
      ? undefined
      : effectiveAllLayersOrdered.find((l) => l.id === comparisonBundleFilterRootId);
    const name = rootLayer
      ? resolveComparisonLayerLabel(rootLayer, locale, `${t(locale, 'transcription.comparison.bundleLabel')} ${ord}`)
      : tf(locale, 'transcription.comparison.bundleFilterFallbackItem', { ordinal: ord });
    return tf(locale, 'transcription.comparison.bundleFilterTitleOne', { name });
  }, [bundleOrdinalByKey, comparisonBundleFilterRootId, effectiveAllLayersOrdered, locale, orderedDistinctBundleKeys]);

  const sourceHeaderLabel = useMemo(
    () => resolveComparisonLayerLabel(sourceLayer, locale, t(locale, 'transcription.comparison.sourceHeader')),
    [locale, sourceLayer],
  );

  const comparisonHeaderOrthographies = displayStyleControl?.orthographies ?? [];

  const resolveComparisonHeaderContentForLayer = useCallback((layer: LayerDocType | undefined, fallbackLabel: string): string => {
    if (!layer) return fallbackLabel;
    const inline = buildLaneHeaderInlineDotSeparatedLabel(layer, locale, comparisonHeaderOrthographies);
    const trimmed = inline.trim();
    return trimmed.length > 0 ? trimmed : fallbackLabel;
  }, [comparisonHeaderOrthographies, locale]);

  const sourceHeaderContent = useMemo(
    () => resolveComparisonHeaderContentForLayer(sourceLayer, sourceHeaderLabel),
    [resolveComparisonHeaderContentForLayer, sourceHeaderLabel, sourceLayer],
  );

  const activeComparisonGroupForHeader = useMemo(() => {
    if (groups.length === 0) return undefined;
    if (activeComparisonGroupId) {
      const exact = groups.find((g) => g.id === activeComparisonGroupId);
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
  }, [activeComparisonGroupId, activeUnitId, groups]);

  const headerTargetLayers = useMemo(() => {
    if (translationLayers.length === 0) return [] as LayerDocType[];
    const fromGroup = activeComparisonGroupForHeader
      ? filterTranslationLayersForComparisonGroup(
          activeComparisonGroupForHeader,
          translationLayers,
          transcriptionLayers,
          defaultTranscriptionLayerId,
          sourceLayer?.id,
          layerLinks,
        )
      : [];
    if (activeComparisonGroupForHeader && fromGroup.length === 0) return [];
    const resolved = fromGroup.length > 0
      ? fromGroup
      : (targetLayer ? [targetLayer] : (translationLayers[0] ? [translationLayers[0]] : []));
    if (!targetLayer) return resolved;
    const preferred = resolved.find((l) => l.id === targetLayer.id);
    if (!preferred) return resolved;
    return [preferred, ...resolved.filter((l) => l.id !== preferred.id)];
  }, [
    activeComparisonGroupForHeader,
    defaultTranscriptionLayerId,
    layerLinks,
    sourceLayer?.id,
    targetLayer,
    transcriptionLayers,
    translationLayers,
  ]);

  const comparisonStyleMenuItems = useMemo((): ContextMenuItem[] => {
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
      const tlLabel = resolveComparisonLayerLabel(tl, locale, t(locale, 'transcription.comparison.translationHeader'));
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

  const buildComparisonHeaderMenuItems = useCallback((layer: LayerDocType | undefined, headerLabel: string): ContextMenuItem[] => {
    const horizontalOnlyMeta = comparisonMenuText(locale, '仅横向时间轴可用', 'Horizontal timeline only');
    const isSourceHeaderLayer = layer?.id != null && layer.id === sourceLayer?.id;
    const layerRole: ComparisonLayerRole = isSourceHeaderLayer ? 'source' : 'target';
    const isLayerCollapsed = isComparisonLayerCollapsed(compactMode, layerRole);
    const toggleLayerCollapsed = () => {
      if (!layer?.id) return;
      setCompactMode((prev) => toggleComparisonCompactModeForLayer(prev, layerRole));
    };

    const items: ContextMenuItem[] = [
      {
        label: tf(locale, 'transcription.comparison.rowRailFocusLayer', { layer: headerLabel }),
        disabled: !layer?.id,
        onClick: () => {
          if (layer?.id) onFocusLayer(layer.id);
        },
      },
      {
        label: comparisonMenuText(locale, '视图', 'View'),
        variant: 'category',
        separatorBefore: true,
        children: [
          {
            label: t(locale, 'transcription.comparison.allColumns'),
            selectionState: compactMode === 'both' ? 'selected' : 'unselected',
            selectionVariant: 'check',
            onClick: () => setCompactMode('both'),
          },
          {
            label: t(locale, 'transcription.comparison.sourceOnly'),
            selectionState: compactMode === 'source' ? 'selected' : 'unselected',
            selectionVariant: 'check',
            onClick: () => setCompactMode('source'),
          },
          {
            label: t(locale, 'transcription.comparison.translationOnly'),
            selectionState: compactMode === 'target' ? 'selected' : 'unselected',
            selectionVariant: 'check',
            onClick: () => setCompactMode('target'),
          },
          {
            label: comparisonMenuText(
              locale,
              isLayerCollapsed ? '展开该层' : '折叠该层',
              isLayerCollapsed ? 'Expand layer' : 'Collapse layer',
            ),
            separatorBefore: true,
            disabled: !layer?.id,
            onClick: toggleLayerCollapsed,
          },
          {
            label: comparisonMenuText(locale, '显示层级关系', 'Show layer links'),
            meta: horizontalOnlyMeta,
            disabled: true,
          },
        ],
      },
    ];

    if (displayStyleControl && layer) {
      items.push({
        label: t(locale, 'transcription.comparison.layerDisplayStyles'),
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
      label: comparisonMenuText(locale, '层操作', 'Layer operations'),
      variant: 'category',
      children: buildLayerOperationMenuItems({
        layer,
        deletableLayers: effectiveDeletableLayers,
        canOpenTranslationCreate,
        labels: {
          editLayerMetadata: comparisonMenuText(locale, '编辑该层元信息', 'Edit layer metadata'),
          createTranscription: comparisonMenuText(locale, '新建转写层', 'Create transcription layer'),
          createTranslation: comparisonMenuText(locale, '新建翻译层', 'Create translation layer'),
          deleteCurrentLayer: comparisonMenuText(locale, '删除当前层', 'Delete current layer'),
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

  const comparisonHeaderMenuItems = useMemo(() => ({
    source: buildComparisonHeaderMenuItems(sourceLayer, sourceHeaderContent),
  }), [buildComparisonHeaderMenuItems, sourceHeaderContent, sourceLayer]);

  const openComparisonMenuAtPointer = useCallback((event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
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

  const toggleComparisonMenuFromButton = useCallback((event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
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
    comparisonHeaderOrthographies,
    resolveComparisonHeaderContentForLayer,
    headerTargetLayers,
    comparisonStyleMenuItems,
    buildComparisonHeaderMenuItems,
    comparisonHeaderMenuItems,
    openComparisonMenuAtPointer,
    toggleComparisonMenuFromButton,
  };
}
