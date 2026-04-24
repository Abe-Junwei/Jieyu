import { useCallback, useEffect, useMemo, useState } from 'react';
import { LinguisticService } from '../services/LinguisticService';
import type { TextDocType, LayerUnitDocType } from '../db';

type DialogUnit = Pick<LayerUnitDocType, 'textId'>;
export type TextTimelineMode = 'document' | 'media';

export type TextTimeMappingSummaryItem = {
  offsetSec: number;
  scale: number;
  revision: number;
  updatedAt?: string;
  sourceMediaId?: string;
};

export type TextTimeMappingSummary = TextTimeMappingSummaryItem & {
  logicalDurationSec?: number;
  rollback?: TextTimeMappingSummaryItem;
  history?: TextTimeMappingSummaryItem[];
};

function resolvePrimaryLanguageId(text: TextDocType): string | null {
  const metadataLang = (text.metadata as { primaryLanguageId?: unknown } | undefined)?.primaryLanguageId;
  if (typeof metadataLang === 'string' && metadataLang.trim()) {
    return metadataLang.trim();
  }
  if (typeof text.languageCode === 'string' && text.languageCode.trim()) {
    return text.languageCode.trim();
  }
  return null;
}

function resolvePrimaryOrthographyId(text: TextDocType): string | null {
  const metadataOrthography = (text.metadata as { primaryOrthographyId?: unknown } | undefined)?.primaryOrthographyId;
  if (typeof metadataOrthography === 'string' && metadataOrthography.trim()) {
    return metadataOrthography.trim();
  }
  return null;
}

function resolveTimelineMode(text: TextDocType): TextTimelineMode | null {
  const timelineMode = (text.metadata as { timelineMode?: unknown } | undefined)?.timelineMode;
  if (timelineMode === 'document' || timelineMode === 'media') {
    return timelineMode;
  }
  return null;
}

function parseTextTimeMappingSummary(rawMapping: unknown): TextTimeMappingSummaryItem | null {
  if (!rawMapping || typeof rawMapping !== 'object') return null;
  const mapping = rawMapping as {
    offsetSec?: unknown;
    scale?: unknown;
    revision?: unknown;
    updatedAt?: unknown;
    sourceMediaId?: unknown;
  };
  const offsetSec = typeof mapping.offsetSec === 'number' && Number.isFinite(mapping.offsetSec)
    ? mapping.offsetSec
    : undefined;
  const scale = typeof mapping.scale === 'number' && Number.isFinite(mapping.scale)
    ? mapping.scale
    : undefined;
  if (offsetSec === undefined || scale === undefined) return null;
  return {
    offsetSec,
    scale,
    revision: typeof mapping.revision === 'number' && Number.isFinite(mapping.revision)
      ? Math.max(1, Math.trunc(mapping.revision))
      : 1,
    ...(typeof mapping.updatedAt === 'string' && mapping.updatedAt.trim()
      ? { updatedAt: mapping.updatedAt.trim() }
      : {}),
    ...(typeof mapping.sourceMediaId === 'string' && mapping.sourceMediaId.trim()
      ? { sourceMediaId: mapping.sourceMediaId.trim() }
      : {}),
  };
}

function resolveTextTimeMapping(text: TextDocType): TextTimeMappingSummary | null {
  const metadata = text.metadata as {
    timeMapping?: unknown;
    timeMappingRollback?: unknown;
    timeMappingHistory?: unknown;
    logicalDurationSec?: unknown;
  } | undefined;
  const current = parseTextTimeMappingSummary(metadata?.timeMapping);
  const logicalDurationSec = typeof metadata?.logicalDurationSec === 'number'
    && Number.isFinite(metadata.logicalDurationSec)
    && metadata.logicalDurationSec > 0
    ? metadata.logicalDurationSec
    : undefined;

  if (!current) {
    return logicalDurationSec !== undefined
      ? {
          offsetSec: 0,
          scale: 1,
          revision: 0,
          logicalDurationSec,
        }
      : null;
  }

  const rollback = parseTextTimeMappingSummary(metadata?.timeMappingRollback);
  const history = Array.isArray(metadata?.timeMappingHistory)
    ? metadata.timeMappingHistory
      .map((item) => parseTextTimeMappingSummary(item))
      .filter((item): item is TextTimeMappingSummaryItem => item !== null)
    : [];
  return {
    ...current,
    ...(logicalDurationSec !== undefined ? { logicalDurationSec } : {}),
    ...(rollback ? { rollback } : {}),
    ...(history.length > 0 ? { history } : {}),
  };
}

export function useDialogs(units: DialogUnit[]) {
  const unitTextIdSignature = useMemo(
    () => units.map((unit) => unit.textId).join('|'),
    [units],
  );
  const [showProjectSetup, setShowProjectSetup] = useState(false);
  const [showAudioImport, setShowAudioImport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showUndoHistory, setShowUndoHistory] = useState(false);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [activeTextPrimaryLanguageId, setActiveTextPrimaryLanguageId] = useState<string | null>(null);
  const [activeTextPrimaryOrthographyId, setActiveTextPrimaryOrthographyId] = useState<string | null>(null);
  const [activeTextTimelineMode, setActiveTextTimelineMode] = useState<TextTimelineMode | null>(null);
  const [activeTextTimeMapping, setActiveTextTimeMapping] = useState<TextTimeMappingSummary | null>(null);
  const firstUnitTextId = units[0]?.textId;

  const getActiveTextId = useCallback(async (): Promise<string | null> => {
    if (activeTextId) return activeTextId;
    const texts = await LinguisticService.getAllTexts();
    const first = texts[0];
    if (first) {
      setActiveTextId(first.id);
      setActiveTextPrimaryLanguageId(resolvePrimaryLanguageId(first));
      setActiveTextPrimaryOrthographyId(resolvePrimaryOrthographyId(first));
      setActiveTextTimelineMode(resolveTimelineMode(first));
      setActiveTextTimeMapping(resolveTextTimeMapping(first));
      return first.id;
    }
    return null;
  }, [activeTextId]);

  const getActiveTextPrimaryLanguageId = useCallback(async (): Promise<string | null> => {
    if (activeTextPrimaryLanguageId) return activeTextPrimaryLanguageId;
    const texts = await LinguisticService.getAllTexts();
    const resolvedTextId = activeTextId ?? texts[0]?.id;
    if (!resolvedTextId) return null;
    const activeText = texts.find((text) => text.id === resolvedTextId);
    if (!activeText) return null;
    const languageId = resolvePrimaryLanguageId(activeText);
    setActiveTextPrimaryLanguageId(languageId);
    setActiveTextPrimaryOrthographyId(resolvePrimaryOrthographyId(activeText));
    setActiveTextTimelineMode(resolveTimelineMode(activeText));
    setActiveTextTimeMapping(resolveTextTimeMapping(activeText));
    if (!activeTextId) setActiveTextId(activeText.id);
    return languageId;
  }, [activeTextId, activeTextPrimaryLanguageId]);

  const getActiveTextTimelineMode = useCallback(async (): Promise<TextTimelineMode | null> => {
    if (activeTextTimelineMode) return activeTextTimelineMode;
    const texts = await LinguisticService.getAllTexts();
    const resolvedTextId = activeTextId ?? texts[0]?.id;
    if (!resolvedTextId) return null;
    const activeText = texts.find((text) => text.id === resolvedTextId);
    if (!activeText) return null;
    const timelineMode = resolveTimelineMode(activeText);
    setActiveTextTimelineMode(timelineMode);
    setActiveTextPrimaryLanguageId(resolvePrimaryLanguageId(activeText));
    setActiveTextPrimaryOrthographyId(resolvePrimaryOrthographyId(activeText));
    setActiveTextTimeMapping(resolveTextTimeMapping(activeText));
    if (!activeTextId) setActiveTextId(activeText.id);
    return timelineMode;
  }, [activeTextId, activeTextTimelineMode]);

  /**
   * 刷新后首几帧常出现：activeTextId 刚由 units[0] 推入、但 getAllTexts 尚未返回 → activeTextTimeMapping 为 null，
   * 桥里 compute 退到 1800s、zoom 比稳定后小约 9×。用单条 getTextById 且 targetId=activeTextId ?? units[0].textId，尽早取 metadata。 |
   * After F5, avoid falling back to DEFAULT 1800 document span while text mapping is still null.
   */
  useEffect(() => {
    if (!activeTextId && !firstUnitTextId) {
      setActiveTextPrimaryLanguageId(null);
      setActiveTextPrimaryOrthographyId(null);
      setActiveTextTimelineMode(null);
      setActiveTextTimeMapping(null);
      return;
    }
    if (!activeTextId && firstUnitTextId) {
      setActiveTextId(firstUnitTextId);
    }
    const targetId = activeTextId ?? firstUnitTextId;
    if (!targetId) return;
    let cancelled = false;
    void LinguisticService.getTextById(targetId).then((activeText) => {
      if (cancelled || !activeText) return;
      if (activeText.id !== targetId) return;
      setActiveTextPrimaryLanguageId(resolvePrimaryLanguageId(activeText));
      setActiveTextPrimaryOrthographyId(resolvePrimaryOrthographyId(activeText));
      setActiveTextTimelineMode(resolveTimelineMode(activeText));
      setActiveTextTimeMapping(resolveTextTimeMapping(activeText));
    });
    return () => { cancelled = true; };
  }, [activeTextId, firstUnitTextId, unitTextIdSignature]);

  return {
    showProjectSetup,
    setShowProjectSetup,
    showAudioImport,
    setShowAudioImport,
    showSearch,
    setShowSearch,
    showUndoHistory,
    setShowUndoHistory,
    activeTextId,
    setActiveTextId,
    activeTextPrimaryLanguageId,
    activeTextPrimaryOrthographyId,
    activeTextTimelineMode,
    activeTextTimeMapping,
    getActiveTextId,
    getActiveTextPrimaryLanguageId,
    getActiveTextTimelineMode,
  };
}
