import { useCallback, useMemo, useState } from 'react';
import type { LayerDocType, LayerLinkDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/messages';
import {
  type ExistingLayerConstraintIssue,
  type ExistingLayerConstraintRepair,
  hasRepairPersistableLayerDiff,
  repairExistingLayerConstraints,
  validateExistingLayerConstraints,
} from '../services/LayerConstraintService';
import type { Locale } from '../i18n';
import { type LayerOrderIssue, type LayerOrderRepair, repairLayerOrder, validateLayerOrder } from '../services/LayerOrderingService';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';

export interface SidePaneSidebarConstraintRepairDetails {
  repairs: ExistingLayerConstraintRepair[];
  issues: ExistingLayerConstraintIssue[];
  orderRepairs: LayerOrderRepair[];
  orderIssues: LayerOrderIssue[];
}

export interface SidePaneSidebarConstraintRepairGroup {
  layerId: string;
  label: string;
  repairs: ExistingLayerConstraintRepair[];
  issues: ExistingLayerConstraintIssue[];
  orderRepairs: LayerOrderRepair[];
  orderIssues: LayerOrderIssue[];
}

interface UseSidePaneSidebarConstraintRepairOptions {
  messages: SidePaneSidebarMessages;
  sidePaneRows: LayerDocType[];
  layerLabelById: Map<string, string>;
  layerLinks?: readonly LayerLinkDocType[] | undefined;
  locale: Locale;
}

export function useSidePaneSidebarConstraintRepair({
  messages,
  sidePaneRows,
  layerLabelById,
  layerLinks = [],
  locale,
}: UseSidePaneSidebarConstraintRepairOptions) {
  const [constraintRepairBusy, setConstraintRepairBusy] = useState(false);
  const [constraintRepairMessage, setConstraintRepairMessage] = useState('');
  const [constraintRepairDetails, setConstraintRepairDetails] = useState<SidePaneSidebarConstraintRepairDetails | null>(null);
  const [constraintRepairDetailsCollapsed, setConstraintRepairDetailsCollapsed] = useState(false);

  const groupedConstraintRepairDetails = useMemo(() => {
    if (!constraintRepairDetails) return [] as SidePaneSidebarConstraintRepairGroup[];

    const grouped = new Map<string, SidePaneSidebarConstraintRepairGroup>();
    const ensureGroup = (layerId: string) => {
      const existing = grouped.get(layerId);
      if (existing) return existing;
      const created: SidePaneSidebarConstraintRepairGroup = {
        layerId,
        label: layerLabelById.get(layerId) ?? layerId,
        repairs: [],
        issues: [],
        orderRepairs: [],
        orderIssues: [],
      };
      grouped.set(layerId, created);
      return created;
    };

    for (const repair of constraintRepairDetails.repairs) {
      ensureGroup(repair.layerId).repairs.push(repair);
    }
    for (const issue of constraintRepairDetails.issues) {
      ensureGroup(issue.layerId).issues.push(issue);
    }
    for (const repair of constraintRepairDetails.orderRepairs) {
      ensureGroup(repair.layerId).orderRepairs.push(repair);
    }
    for (const issue of constraintRepairDetails.orderIssues) {
      ensureGroup(issue.layerId).orderIssues.push(issue);
    }

    return Array.from(grouped.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans-CN'));
  }, [constraintRepairDetails, layerLabelById]);

  const handleRepairLayerConstraints = useCallback(async () => {
    setConstraintRepairBusy(true);
    setConstraintRepairMessage('');
    setConstraintRepairDetails(null);
    setConstraintRepairDetailsCollapsed(false);

    try {
      const constraintRepaired = repairExistingLayerConstraints(sidePaneRows, undefined, locale, layerLinks);
      const orderRepaired = repairLayerOrder(constraintRepaired.layers);
      const layerById = new Map(sidePaneRows.map((layer) => [layer.id, layer] as const));
      const changedLayers = orderRepaired.layers.filter((layer) => {
        const before = layerById.get(layer.id);
        if (!before) return false;
        return hasRepairPersistableLayerDiff(before, layer, sidePaneRows, layerLinks);
      });
      const changedSortLayers = orderRepaired.layers.filter((layer) => {
        const before = layerById.get(layer.id);
        if (!before) return false;
        return (before.sortOrder ?? 0) !== (layer.sortOrder ?? 0);
      });

      if (changedLayers.length > 0) {
        const now = new Date().toISOString();
        await Promise.all(changedLayers.map((layer) => LayerTierUnifiedService.updateLayer({
          ...layer,
          updatedAt: now,
        })));
      }
      if (changedSortLayers.length > 0) {
        await Promise.all(changedSortLayers.map((layer) => LayerTierUnifiedService.updateLayerSortOrder(layer.id, layer.sortOrder ?? 0)));
      }

      const remainingIssues = validateExistingLayerConstraints(orderRepaired.layers, undefined, locale, layerLinks);
      const remainingOrderIssues = validateLayerOrder(orderRepaired.layers);
      setConstraintRepairDetails({
        repairs: constraintRepaired.repairs,
        issues: remainingIssues,
        orderRepairs: orderRepaired.repairs,
        orderIssues: remainingOrderIssues,
      });

      if (changedLayers.length === 0 && changedSortLayers.length === 0 && remainingIssues.length === 0 && remainingOrderIssues.length === 0) {
        setConstraintRepairMessage(messages.repairNoNeed);
        return;
      }

      setConstraintRepairMessage(
        (remainingIssues.length > 0 || remainingOrderIssues.length > 0)
          ? messages.repairSummary(changedLayers.length, changedSortLayers.length, remainingIssues.length + remainingOrderIssues.length)
          : messages.repairSummaryDone(changedLayers.length, changedSortLayers.length),
      );
    } catch (error) {
      setConstraintRepairMessage(`${messages.repairFailedPrefix}${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setConstraintRepairBusy(false);
    }
  }, [layerLabelById, layerLinks, locale, messages, sidePaneRows]);

  return {
    constraintRepairBusy,
    constraintRepairMessage,
    constraintRepairDetails,
    constraintRepairDetailsCollapsed,
    groupedConstraintRepairDetails,
    setConstraintRepairDetailsCollapsed,
    handleRepairLayerConstraints,
  };
}
