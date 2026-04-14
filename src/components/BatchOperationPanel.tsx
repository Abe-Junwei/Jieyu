import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { JIEYU_LUCIDE_PANEL_CLOSE_LG } from '../utils/jieyuLucideIcon';
import type { UtteranceDocType } from '../db';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { useLocale } from '../i18n';
import { getBatchOperationPanelMessages } from '../i18n/batchOperationPanelMessages';
import type { OrthographyPreviewTextProps } from '../utils/layerDisplayStyle';
import { DialogOverlay, DialogShell, FormField, PanelButton, PanelChip, PanelSection, PanelSummary } from './ui';

type BatchTab = 'offset' | 'scale' | 'split' | 'merge';
type PreviewScope = 'selected' | 'layer-all';

type PreviewUtterance = Pick<UtteranceDocType, 'id' | 'startTime' | 'endTime'>;

type PreviewLevel = 'ok' | 'warning' | 'error';

type PreviewRow = {
  id: string;
  originalValue: string;
  nextValue: string;
  detail: string;
  level: PreviewLevel;
  conflict: string;
};

type PreviewResult = {
  rows: PreviewRow[];
  blockingCount: number;
  warningCount: number;
  okCount: number;
  globalMessage: string;
};

interface BatchOperationPanelProps {
  selectedCount: number;
  selectedUtterances: PreviewUtterance[];
  allUtterancesOnMedia: PreviewUtterance[];
  utteranceTextById: Record<string, string>;
  previewLayerOptions?: Array<{ id: string; label: string }>;
  previewTextByLayerId?: Record<string, Record<string, string>>;
  previewTextPropsByLayerId?: Record<string, OrthographyPreviewTextProps>;
  defaultPreviewLayerId?: string;
  onClose: () => void;
  onOffset: (deltaSec: number) => Promise<void>;
  onScale: (factor: number, anchorTime?: number) => Promise<void>;
  onSplitByRegex: (pattern: string, flags?: string) => Promise<void>;
  onMerge: () => Promise<void>;
  onJumpToUtterance?: (id: string) => void;
}

const MIN_SPAN = 0.05;
const GAP = 0.02;

function round3(v: number): number {
  return Number(v.toFixed(3));
}

function formatRange(start: number, end: number): string {
  return `${start.toFixed(3)}s -> ${end.toFixed(3)}s`;
}

function buildOverlapConflicts(
  allUtterancesOnMedia: PreviewUtterance[],
  transformed: Map<string, { startTime: number; endTime: number }>,
  selectedIds: Set<string>,
  overlapLabel: string,
): Map<string, string> {
  const conflicts = new Map<string, string>();
  const timeline = allUtterancesOnMedia
    .map((u) => {
      const next = transformed.get(u.id);
      if (next) {
        return { id: u.id, startTime: next.startTime, endTime: next.endTime };
      }
      return u;
    })
    .sort((a, b) => a.startTime - b.startTime);

  for (let i = 1; i < timeline.length; i += 1) {
    const prev = timeline[i - 1]!;
    const current = timeline[i]!;
    if (current.startTime < prev.endTime + GAP) {
      if (selectedIds.has(prev.id)) {
        conflicts.set(prev.id, overlapLabel);
      }
      if (selectedIds.has(current.id)) {
        conflicts.set(current.id, overlapLabel);
      }
    }
  }

  return conflicts;
}

function countLevels(rows: PreviewRow[]) {
  let blockingCount = 0;
  let warningCount = 0;
  let okCount = 0;
  for (const row of rows) {
    if (row.level === 'error') blockingCount += 1;
    else if (row.level === 'warning') warningCount += 1;
    else okCount += 1;
  }
  return { blockingCount, warningCount, okCount };
}

export function BatchOperationPanel({
  selectedCount,
  selectedUtterances,
  allUtterancesOnMedia,
  utteranceTextById,
  previewLayerOptions = [],
  previewTextByLayerId,
  previewTextPropsByLayerId,
  defaultPreviewLayerId,
  onClose,
  onOffset,
  onScale,
  onSplitByRegex,
  onMerge,
  onJumpToUtterance,
}: BatchOperationPanelProps) {
  const locale = useLocale();
  const messages = getBatchOperationPanelMessages(locale);
  const [tab, setTab] = useState<BatchTab>('offset');
  const [deltaSec, setDeltaSec] = useState('0.200');
  const [scaleFactor, setScaleFactor] = useState('1.100');
  const [anchorTime, setAnchorTime] = useState('');
  const [regexPattern, setRegexPattern] = useState('[,，。？！;；]\\s*');
  const [regexFlags, setRegexFlags] = useState('');
  const [running, setRunning] = useState(false);
  const [showOnlyConflicts, setShowOnlyConflicts] = useState(false);
  const [previewScope, setPreviewScope] = useState<PreviewScope>('selected');
  const [previewLayerId, setPreviewLayerId] = useState<string>(defaultPreviewLayerId ?? previewLayerOptions[0]?.id ?? '');
  const isMountedRef = useRef(true);

  const {
    position,
    size,
    handleDragStart,
    handleResizeStart,
    handleRecenter,
    handleResetPanelLayout,
  } = useDraggablePanel({
    storageKey: 'jieyu:batch-operation-panel-rect',
    defaultPosition: { x: 24, y: 80 },
    defaultSize: { width: 720, height: 480 },
    minWidth: 400,
    minHeight: 300,
    maxWidth: 900,
    maxHeight: 800,
    margin: 16,
  });

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const runAction = (task: Promise<void>): void => {
    setRunning(true);
    void task.finally(() => {
      if (isMountedRef.current) {
        setRunning(false);
      }
    });
  };

  useEffect(() => {
    if (previewLayerOptions.length === 0) {
      if (previewLayerId !== '') setPreviewLayerId('');
      return;
    }
    if (previewLayerId && previewLayerOptions.some((item) => item.id === previewLayerId)) {
      return;
    }
    const preferred = defaultPreviewLayerId && previewLayerOptions.some((item) => item.id === defaultPreviewLayerId)
      ? defaultPreviewLayerId
      : previewLayerOptions[0]!.id;
    setPreviewLayerId(preferred);
  }, [defaultPreviewLayerId, previewLayerId, previewLayerOptions]);

  const sortedSelected = useMemo(
    () => [...selectedUtterances].sort((a, b) => a.startTime - b.startTime),
    [selectedUtterances],
  );

  const sortedAllOnMedia = useMemo(
    () => [...allUtterancesOnMedia].sort((a, b) => a.startTime - b.startTime),
    [allUtterancesOnMedia],
  );

  const previewTargets = useMemo(() => {
    if (tab === 'merge') return sortedSelected;
    return previewScope === 'layer-all' ? sortedAllOnMedia : sortedSelected;
  }, [previewScope, sortedAllOnMedia, sortedSelected, tab]);

  const activeUtteranceTextById = useMemo(() => {
    if (previewLayerId && previewTextByLayerId?.[previewLayerId]) {
      return previewTextByLayerId[previewLayerId]!;
    }
    return utteranceTextById;
  }, [previewLayerId, previewTextByLayerId, utteranceTextById]);

  const activePreviewTextProps = useMemo(() => {
    if (previewLayerId && previewTextPropsByLayerId?.[previewLayerId]) {
      return previewTextPropsByLayerId[previewLayerId]!;
    }
    if (defaultPreviewLayerId && previewTextPropsByLayerId?.[defaultPreviewLayerId]) {
      return previewTextPropsByLayerId[defaultPreviewLayerId]!;
    }
    return undefined;
  }, [defaultPreviewLayerId, previewLayerId, previewTextPropsByLayerId]);

  const preview = useMemo<PreviewResult>(() => {
    if (previewTargets.length === 0) {
      return {
        rows: [],
        blockingCount: 0,
        warningCount: 0,
        okCount: 0,
        globalMessage: messages.previewNoSelection,
      };
    }

    if (tab === 'offset') {
      const delta = Number(deltaSec);
      if (!Number.isFinite(delta)) {
        return {
          rows: [],
          blockingCount: 1,
          warningCount: 0,
          okCount: 0,
          globalMessage: messages.invalidOffsetNumber,
        };
      }
      const transformed = new Map<string, { startTime: number; endTime: number }>();
      const rows: PreviewRow[] = previewTargets.map((u) => {
        const nextStart = round3(u.startTime + delta);
        const nextEnd = round3(u.endTime + delta);
        transformed.set(u.id, { startTime: nextStart, endTime: nextEnd });
        if (nextStart < 0) {
          return {
            id: u.id,
            originalValue: formatRange(u.startTime, u.endTime),
            nextValue: formatRange(nextStart, nextEnd),
            detail: messages.offsetDetail(delta),
            level: 'error',
            conflict: messages.conflictNegativeTime,
          };
        }
        if (nextEnd - nextStart < MIN_SPAN) {
          return {
            id: u.id,
            originalValue: formatRange(u.startTime, u.endTime),
            nextValue: formatRange(nextStart, nextEnd),
            detail: messages.offsetDetail(delta),
            level: 'error',
            conflict: messages.conflictDurationTooShort,
          };
        }
        return {
          id: u.id,
          originalValue: formatRange(u.startTime, u.endTime),
          nextValue: formatRange(nextStart, nextEnd),
          detail: messages.offsetDetail(delta),
          level: 'ok',
          conflict: messages.conflictNone,
        };
      });

      const overlapConflicts = buildOverlapConflicts(
        allUtterancesOnMedia,
        transformed,
        new Set(previewTargets.map((u) => u.id)),
        messages.overlapAdjacent,
      );
      for (const row of rows) {
        if (row.level === 'error') continue;
        const overlap = overlapConflicts.get(row.id);
        if (overlap) {
          row.level = 'error';
          row.conflict = overlap;
        }
      }

      const stats = countLevels(rows);
      return {
        rows,
        ...stats,
        globalMessage: stats.blockingCount > 0 ? messages.globalBlocking : messages.globalPreviewPass,
      };
    }

    if (tab === 'scale') {
      const factor = Number(scaleFactor);
      if (!Number.isFinite(factor) || factor <= 0) {
        return {
          rows: [],
          blockingCount: 1,
          warningCount: 0,
          okCount: 0,
          globalMessage: messages.invalidScaleFactor,
        };
      }
      const parsedAnchor = anchorTime.trim() ? Number(anchorTime) : undefined;
      if (anchorTime.trim() && !Number.isFinite(parsedAnchor ?? Number.NaN)) {
        return {
          rows: [],
          blockingCount: 1,
          warningCount: 0,
          okCount: 0,
          globalMessage: messages.invalidAnchorTime,
        };
      }

      const pivot = Number.isFinite(parsedAnchor ?? Number.NaN)
        ? Number(parsedAnchor)
        : previewTargets[0]!.startTime;

      const transformed = new Map<string, { startTime: number; endTime: number }>();
      const rows: PreviewRow[] = previewTargets.map((u) => {
        const nextStart = round3(pivot + (u.startTime - pivot) * factor);
        const nextEnd = round3(pivot + (u.endTime - pivot) * factor);
        transformed.set(u.id, { startTime: nextStart, endTime: nextEnd });
        if (nextStart < 0) {
          return {
            id: u.id,
            originalValue: formatRange(u.startTime, u.endTime),
            nextValue: formatRange(nextStart, nextEnd),
            detail: messages.scaleDetail(factor, pivot),
            level: 'error',
            conflict: messages.conflictNegativeTime,
          };
        }
        if (nextEnd - nextStart < MIN_SPAN) {
          return {
            id: u.id,
            originalValue: formatRange(u.startTime, u.endTime),
            nextValue: formatRange(nextStart, nextEnd),
            detail: messages.scaleDetail(factor, pivot),
            level: 'error',
            conflict: messages.conflictDurationTooShort,
          };
        }
        return {
          id: u.id,
          originalValue: formatRange(u.startTime, u.endTime),
          nextValue: formatRange(nextStart, nextEnd),
          detail: messages.scaleDetail(factor, pivot),
          level: 'ok',
          conflict: messages.conflictNone,
        };
      });

      const overlapConflicts = buildOverlapConflicts(
        allUtterancesOnMedia,
        transformed,
        new Set(previewTargets.map((u) => u.id)),
        messages.overlapAdjacent,
      );
      for (const row of rows) {
        if (row.level === 'error') continue;
        const overlap = overlapConflicts.get(row.id);
        if (overlap) {
          row.level = 'error';
          row.conflict = overlap;
        }
      }

      const stats = countLevels(rows);
      return {
        rows,
        ...stats,
        globalMessage: stats.blockingCount > 0 ? messages.globalBlocking : messages.globalPreviewPass,
      };
    }

    if (tab === 'split') {
      const rawPattern = regexPattern.trim();
      if (!rawPattern) {
        return {
          rows: [],
          blockingCount: 1,
          warningCount: 0,
          okCount: 0,
          globalMessage: messages.regexRequired,
        };
      }

      let splitter: RegExp;
      try {
        const normalizedFlags = [...new Set(`${regexFlags}g`.split(''))].join('');
        splitter = new RegExp(rawPattern, normalizedFlags);
      } catch (err) {
        console.error('[Jieyu] BatchOperationPanel: invalid regex pattern', { rawPattern, regexFlags, err });
        return {
          rows: [],
          blockingCount: 1,
          warningCount: 0,
          okCount: 0,
          globalMessage: messages.regexInvalid,
        };
      }

      const rows: PreviewRow[] = previewTargets.map((u) => {
        const text = (activeUtteranceTextById[u.id] ?? '').trim();
        if (!text) {
          return {
            id: u.id,
            originalValue: formatRange(u.startTime, u.endTime),
            nextValue: '-',
            detail: messages.sourceTextEmpty,
            level: 'warning',
            conflict: messages.skipped,
          };
        }

        const segments = text
          .split(splitter)
          .map((part) => part.trim())
          .filter((part) => part.length > 0);

        if (segments.length < 2) {
          return {
            id: u.id,
            originalValue: formatRange(u.startTime, u.endTime),
            nextValue: '-',
            detail: messages.matchedSegments(segments.length),
            level: 'warning',
            conflict: messages.skipped,
          };
        }

        const totalChars = Math.max(1, segments.reduce((sum, part) => sum + part.length, 0));
        const duration = u.endTime - u.startTime;
        const bounds: Array<{ start: number; end: number }> = [];
        let cursor = u.startTime;
        for (let i = 0; i < segments.length; i += 1) {
          if (i === segments.length - 1) {
            bounds.push({ start: cursor, end: u.endTime });
            break;
          }
          const ratio = segments[i]!.length / totalChars;
          const segDuration = Math.max(MIN_SPAN, round3(duration * ratio));
          const next = round3(cursor + segDuration);
          bounds.push({ start: cursor, end: next });
          cursor = next;
        }

        if (bounds.some((item) => item.end - item.start < MIN_SPAN)) {
          return {
            id: u.id,
            originalValue: formatRange(u.startTime, u.endTime),
            nextValue: '-',
            detail: messages.segmentedTooShort(segments.length),
            level: 'warning',
            conflict: messages.skipped,
          };
        }

        const nextValue = bounds
          .slice(0, 2)
          .map((b) => formatRange(b.start, b.end))
          .join(' | ');
        const truncatedHint = bounds.length > 2 ? messages.totalSegments(bounds.length) : '';
        const textHint = segments.slice(0, 2).join(' / ');

        return {
          id: u.id,
          originalValue: formatRange(u.startTime, u.endTime),
          nextValue: `${nextValue}${truncatedHint}`,
          detail: messages.textDetail(textHint, segments.length > 2),
          level: 'ok',
          conflict: messages.conflictNone,
        };
      });

      const stats = countLevels(rows);
      return {
        rows,
        ...stats,
        globalMessage: stats.okCount > 0 ? messages.splitPreviewReady : messages.splitPreviewEmpty,
      };
    }

    const rows: PreviewRow[] = sortedSelected.map((u, index) => {
      const first = sortedSelected[0]!;
      const last = sortedSelected[sortedSelected.length - 1]!;
      if (sortedSelected.length < 2) {
        return {
          id: u.id,
          originalValue: formatRange(u.startTime, u.endTime),
          nextValue: '-',
          detail: messages.needAtLeastTwo,
          level: 'error',
          conflict: messages.insufficientCount,
        };
      }
      if (index === 0) {
        return {
          id: u.id,
          originalValue: formatRange(u.startTime, u.endTime),
          nextValue: formatRange(first.startTime, last.endTime),
          detail: messages.keepAndExtend,
          level: 'ok',
          conflict: messages.conflictNone,
        };
      }
      return {
        id: u.id,
        originalValue: formatRange(u.startTime, u.endTime),
        nextValue: messages.mergeInto(first.id),
        detail: messages.mergeDeleteAndMove,
        level: 'ok',
        conflict: messages.conflictNone,
      };
    });

    const stats = countLevels(rows);
    return {
      rows,
      ...stats,
      globalMessage: stats.blockingCount > 0 ? messages.mergeConditionNotMet : messages.globalPreviewPass,
    };
  }, [
    allUtterancesOnMedia,
    anchorTime,
    deltaSec,
    regexFlags,
    regexPattern,
    scaleFactor,
    previewTargets,
    activeUtteranceTextById,
    messages,
    sortedSelected,
    tab,
  ]);

  const canSubmit = useMemo(
    () => selectedCount > 0 && !running && preview.blockingCount === 0,
    [preview.blockingCount, running, selectedCount],
  );

  const activeTabLabel = tab === 'offset'
    ? messages.tabOffset
    : tab === 'scale'
      ? messages.tabScale
      : tab === 'split'
        ? messages.tabSplit
        : messages.tabMerge;

  const submitLabel = tab === 'offset'
    ? messages.runOffset
    : tab === 'scale'
      ? messages.runScale
      : tab === 'split'
        ? messages.runSplit
        : messages.runMerge;

  const canRunCurrentAction = canSubmit && (tab !== 'merge' || selectedCount >= 2);

  const handleSubmit = () => {
    if (tab === 'offset') {
      const value = Number(deltaSec);
      if (!Number.isFinite(value)) return;
      runAction(onOffset(value));
      return;
    }
    if (tab === 'scale') {
      const factor = Number(scaleFactor);
      const anchor = anchorTime.trim() ? Number(anchorTime) : undefined;
      if (!Number.isFinite(factor)) return;
      runAction(onScale(factor, Number.isFinite(anchor ?? Number.NaN) ? anchor : undefined));
      return;
    }
    if (tab === 'split') {
      if (!regexPattern.trim()) return;
      runAction(onSplitByRegex(regexPattern, regexFlags));
      return;
    }
    runAction(onMerge());
  };

  return (
    <DialogOverlay onClose={onClose} topmost>
      <DialogShell
        className="batch-operation-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={messages.panelTitle}
        title={messages.panelTitle}
        bodyClassName="batch-operation-panel-body"
        headerClassName="batch-operation-drag-handle"
        headerProps={{ onPointerDown: handleDragStart, onDoubleClick: handleRecenter }}
        actions={(
          <>
            <button
              type="button"
              className="batch-operation-reset-btn"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleResetPanelLayout}
              aria-label={messages.resetLayout}
              title={messages.resetLayout}
            >
              ↺
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              title={messages.close}
              aria-label={messages.close}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <X className={JIEYU_LUCIDE_PANEL_CLOSE_LG} />
            </button>
          </>
        )}
        footerClassName="batch-operation-footer"
        footer={(
          <>
            <PanelButton variant="ghost" onClick={onClose} disabled={running}>{messages.close}</PanelButton>
            <PanelButton variant="primary" disabled={!canRunCurrentAction} onClick={handleSubmit}>{submitLabel}</PanelButton>
          </>
        )}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        <PanelSummary
          className="batch-operation-summary-card"
          title={messages.selectedCount(selectedCount)}
          description={preview.globalMessage}
          descriptionClassName={preview.blockingCount > 0 ? 'batch-operation-summary-copy-danger' : undefined}
          meta={(
            <div className="panel-meta">
              <PanelChip variant="success">{messages.passCount(preview.okCount)}</PanelChip>
              <PanelChip variant="warning">{messages.warnCount(preview.warningCount)}</PanelChip>
              <PanelChip variant="danger">{messages.blockCount(preview.blockingCount)}</PanelChip>
            </div>
          )}
          supportingText={previewScope === 'layer-all' ? messages.layerAllHint(previewTargets.length) : undefined}
        />

          <PanelSection className="batch-operation-section batch-operation-section-dense" title={activeTabLabel}>
            <div className="dialog-segmented-tabs" role="tablist" aria-label={messages.panelTitle}>
              <button className={`dialog-segmented-tab${tab === 'offset' ? ' dialog-segmented-tab-active' : ''}`} onClick={() => setTab('offset')}>{messages.tabOffset}</button>
              <button className={`dialog-segmented-tab${tab === 'scale' ? ' dialog-segmented-tab-active' : ''}`} onClick={() => setTab('scale')}>{messages.tabScale}</button>
              <button className={`dialog-segmented-tab${tab === 'split' ? ' dialog-segmented-tab-active' : ''}`} onClick={() => setTab('split')}>{messages.tabSplit}</button>
              <button className={`dialog-segmented-tab${tab === 'merge' ? ' dialog-segmented-tab-active' : ''}`} onClick={() => setTab('merge')}>{messages.tabMerge}</button>
            </div>

            {tab === 'offset' && (
              <div className="batch-operation-controls-grid">
                <FormField htmlFor="batch-operation-offset" label={messages.offsetSeconds}>
                  <input id="batch-operation-offset" value={deltaSec} onChange={(e) => setDeltaSec(e.target.value)} className="input panel-input layer-action-dialog-input" />
                </FormField>
              </div>
            )}

            {tab === 'scale' && (
              <div className="batch-operation-controls-grid">
                <FormField htmlFor="batch-operation-scale-factor" label={messages.scaleFactor}>
                  <input id="batch-operation-scale-factor" value={scaleFactor} onChange={(e) => setScaleFactor(e.target.value)} className="input panel-input layer-action-dialog-input" />
                </FormField>
                <FormField htmlFor="batch-operation-anchor-time" label={messages.anchorTime}>
                  <input id="batch-operation-anchor-time" value={anchorTime} onChange={(e) => setAnchorTime(e.target.value)} className="input panel-input layer-action-dialog-input" placeholder={messages.anchorPlaceholder} />
                </FormField>
              </div>
            )}

            {tab === 'split' && (
              <div className="batch-operation-controls-grid">
                <FormField htmlFor="batch-operation-regex-pattern" label={messages.regexPattern}>
                  <input id="batch-operation-regex-pattern" value={regexPattern} onChange={(e) => setRegexPattern(e.target.value)} className="input panel-input layer-action-dialog-input" />
                </FormField>
                <FormField htmlFor="batch-operation-regex-flags" label={messages.regexFlags}>
                  <input id="batch-operation-regex-flags" value={regexFlags} onChange={(e) => setRegexFlags(e.target.value)} className="input panel-input layer-action-dialog-input" />
                </FormField>
              </div>
            )}

            {tab === 'merge' && (
              <p className="dialog-supporting-note">{messages.mergeHint}</p>
            )}
          </PanelSection>

          <PanelSection className="batch-operation-section batch-operation-section-dense" title={messages.rowPreviewTitle}>
            <div className="batch-operation-controls-grid batch-operation-controls-grid-inline">
              <FormField htmlFor="batch-operation-preview-scope" label={messages.previewScopeLabel}>
                <select
                  id="batch-operation-preview-scope"
                  aria-label={messages.previewScopeAria}
                  value={previewScope}
                  onChange={(e) => setPreviewScope(e.target.value as PreviewScope)}
                  className="input panel-input layer-action-dialog-input"
                >
                  <option value="selected">{messages.previewScopeSelected}</option>
                  <option value="layer-all">{messages.previewScopeLayerAll}</option>
                </select>
              </FormField>

              <FormField htmlFor="batch-operation-preview-layer" label={messages.previewLayerLabel}>
                <select
                  id="batch-operation-preview-layer"
                  aria-label={messages.previewLayerAria}
                  value={previewLayerId}
                  onChange={(e) => setPreviewLayerId(e.target.value)}
                  disabled={previewLayerOptions.length === 0}
                  className="input panel-input layer-action-dialog-input"
                >
                  {previewLayerOptions.length === 0 && <option value="">{messages.previewCurrentLayer}</option>}
                  {previewLayerOptions.map((layer) => (
                    <option key={layer.id} value={layer.id}>{layer.label}</option>
                  ))}
                </select>
              </FormField>
            </div>
          </PanelSection>

          <PanelSection
            className="batch-operation-preview-card"
            title={messages.rowPreviewTitle}
            meta={(
              <div className="batch-operation-preview-toggle">
              {(showOnlyConflicts || preview.warningCount > 0 || preview.blockingCount > 0) && (
                <PanelButton
                  className="batch-operation-preview-filter-btn"
                  onClick={() => setShowOnlyConflicts((v) => !v)}
                >
                  {showOnlyConflicts ? messages.showAll : messages.showConflictsOnly}
                </PanelButton>
              )}
            </div>
            )}
          >
            <div className="batch-operation-table-wrap">
              <table className="batch-operation-table">
                <thead>
                  <tr>
                    <th className="batch-operation-th">#</th>
                    <th className="batch-operation-th">{messages.tableSegmentId}</th>
                    <th className="batch-operation-th">{messages.tableSegmentText}</th>
                    <th className="batch-operation-th">{messages.tableOriginal}</th>
                    <th className="batch-operation-th">{messages.tableNext}</th>
                    <th className="batch-operation-th">{messages.tableDetail}</th>
                    <th className="batch-operation-th">{messages.tableConflict}</th>
                    {onJumpToUtterance && <th className="batch-operation-th">{messages.tableJump}</th>}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows
                    .filter((row) => !showOnlyConflicts || row.level !== 'ok')
                    .map((row, index) => (
                      <tr key={row.id}>
                        <td className="batch-operation-td">{index + 1}</td>
                        <td className="batch-operation-td">{row.id}</td>
                        <td className="batch-operation-td-content" title={activeUtteranceTextById[row.id] ?? ''}>
                          {((activeUtteranceTextById[row.id] ?? '').trim() || '-') === '-'
                            ? '-'
                            : (
                              <span dir={activePreviewTextProps?.dir} style={activePreviewTextProps?.style}>
                                {(activeUtteranceTextById[row.id] ?? '').trim()}
                              </span>
                            )}
                        </td>
                        <td className="batch-operation-td">{row.originalValue}</td>
                        <td className="batch-operation-td">{row.nextValue}</td>
                        <td className="batch-operation-td">{row.detail}</td>
                        <td className="batch-operation-td">
                          <span className={`batch-badge batch-badge-${row.level}`}>{row.conflict}</span>
                        </td>
                        {onJumpToUtterance && (
                          <td className="batch-operation-td">
                            <button
                              className="icon-btn batch-operation-jump-btn"
                              onClick={() => {
                                onJumpToUtterance(row.id);
                                onClose();
                              }}
                            >
                              {messages.jump}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  {preview.rows.filter((r) => !showOnlyConflicts || r.level !== 'ok').length === 0 && (
                    <tr>
                      <td className="batch-operation-td" colSpan={onJumpToUtterance ? 8 : 7}>{messages.noRows}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelSection>

          <p className="dialog-hint batch-operation-shortcut-hint">{messages.shortcutHint}</p>

        <div className="batch-operation-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      </DialogShell>
    </DialogOverlay>
  );
}
