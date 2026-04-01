import { useEffect, useMemo, useRef, useState } from 'react';
import type { UtteranceDocType } from '../db';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { useLocale } from '../i18n';
import { getBatchOperationPanelMessages } from '../i18n/batchOperationPanelMessages';
import type { OrthographyPreviewTextProps } from '../utils/layerDisplayStyle';

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

  return (
    <div className="layer-action-popover-backdrop" onClick={onClose}>
      <div 
        className="floating-panel"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
          padding: 14,
          gap: 10,
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          className="floating-panel-title-row floating-panel-drag-handle" 
          onPointerDown={handleDragStart}
          onDoubleClick={handleRecenter}
          style={{ margin: '-14px -14px 10px', padding: '10px 14px' }}
        >
          <strong>{messages.panelTitle}</strong>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              type="button"
              className="floating-panel-reset-btn"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleResetPanelLayout}
              aria-label={messages.resetLayout}
              title={messages.resetLayout}
            >
              ↺
            </button>
            <button className="icon-btn" onClick={onClose} title={messages.close} onPointerDown={(e) => e.stopPropagation()}>✕</button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {messages.selectedCount(selectedCount)}
        </div>

        <div className="batch-operation-section" style={{ gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="ai-cfg-label">{messages.previewScopeLabel}</label>
            <select
              aria-label={messages.previewScopeAria}
              value={previewScope}
              onChange={(e) => setPreviewScope(e.target.value as PreviewScope)}
              className="ai-cfg-input"
            >
              <option value="selected">{messages.previewScopeSelected}</option>
              <option value="layer-all">{messages.previewScopeLayerAll}</option>
            </select>

            <label className="ai-cfg-label">{messages.previewLayerLabel}</label>
            <select
              aria-label={messages.previewLayerAria}
              value={previewLayerId}
              onChange={(e) => setPreviewLayerId(e.target.value)}
              disabled={previewLayerOptions.length === 0}
              className="ai-cfg-input"
            >
              {previewLayerOptions.length === 0 && <option value="">{messages.previewCurrentLayer}</option>}
              {previewLayerOptions.map((layer) => (
                <option key={layer.id} value={layer.id}>{layer.label}</option>
              ))}
            </select>
          </div>
          {previewScope === 'layer-all' && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {messages.layerAllHint(previewTargets.length)}
            </div>
          )}
        </div>

        <div className="batch-operation-preview-card">
          <div className="batch-operation-preview-header">
            <strong>{messages.rowPreviewTitle}</strong>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
              <span style={{ color: 'var(--state-success-text)' }}>{messages.passCount(preview.okCount)}</span>
              <span style={{ color: 'var(--state-warning-text)' }}>{messages.warnCount(preview.warningCount)}</span>
              <span style={{ color: 'var(--state-danger-text)' }}>{messages.blockCount(preview.blockingCount)}</span>
              {(showOnlyConflicts || preview.warningCount > 0 || preview.blockingCount > 0) && (
                <button
                  className="icon-btn"
                  onClick={() => setShowOnlyConflicts((v) => !v)}
                  style={{ fontSize: 11, padding: '1px 6px' }}
                >
                  {showOnlyConflicts ? messages.showAll : messages.showConflictsOnly}
                </button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12, color: preview.blockingCount > 0 ? 'var(--state-danger-text)' : 'var(--text-primary)' }}>
            {preview.globalMessage}
          </div>
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
                            className="icon-btn"
                            style={{ fontSize: 11, padding: '1px 6px' }}
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
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`icon-btn ${tab === 'offset' ? 'icon-btn-active' : ''}`} onClick={() => setTab('offset')}>{messages.tabOffset}</button>
          <button className={`icon-btn ${tab === 'scale' ? 'icon-btn-active' : ''}`} onClick={() => setTab('scale')}>{messages.tabScale}</button>
          <button className={`icon-btn ${tab === 'split' ? 'icon-btn-active' : ''}`} onClick={() => setTab('split')}>{messages.tabSplit}</button>
          <button className={`icon-btn ${tab === 'merge' ? 'icon-btn-active' : ''}`} onClick={() => setTab('merge')}>{messages.tabMerge}</button>
        </div>

        {tab === 'offset' && (
          <div className="batch-operation-section">
            <label className="ai-cfg-label">{messages.offsetSeconds}</label>
            <input value={deltaSec} onChange={(e) => setDeltaSec(e.target.value)} className="ai-cfg-input" />
            <button
              className="icon-btn"
              disabled={!canSubmit}
              onClick={() => {
                const value = Number(deltaSec);
                if (!Number.isFinite(value)) return;
                runAction(onOffset(value));
              }}
            >
              {messages.runOffset}
            </button>
          </div>
        )}

        {tab === 'scale' && (
          <div className="batch-operation-section">
            <label className="ai-cfg-label">{messages.scaleFactor}</label>
            <input value={scaleFactor} onChange={(e) => setScaleFactor(e.target.value)} className="ai-cfg-input" />
            <label className="ai-cfg-label">{messages.anchorTime}</label>
            <input value={anchorTime} onChange={(e) => setAnchorTime(e.target.value)} className="ai-cfg-input" placeholder={messages.anchorPlaceholder} />
            <button
              className="icon-btn"
              disabled={!canSubmit}
              onClick={() => {
                const factor = Number(scaleFactor);
                const anchor = anchorTime.trim() ? Number(anchorTime) : undefined;
                if (!Number.isFinite(factor)) return;
                runAction(onScale(factor, Number.isFinite(anchor ?? Number.NaN) ? anchor : undefined));
              }}
            >
              {messages.runScale}
            </button>
          </div>
        )}

        {tab === 'split' && (
          <div className="batch-operation-section">
            <label className="ai-cfg-label">{messages.regexPattern}</label>
            <input value={regexPattern} onChange={(e) => setRegexPattern(e.target.value)} className="ai-cfg-input" />
            <label className="ai-cfg-label">{messages.regexFlags}</label>
            <input value={regexFlags} onChange={(e) => setRegexFlags(e.target.value)} className="ai-cfg-input" />
            <button
              className="icon-btn"
              disabled={!canSubmit}
              onClick={() => {
                if (!regexPattern.trim()) return;
                runAction(onSplitByRegex(regexPattern, regexFlags));
              }}
            >
              {messages.runSplit}
            </button>
          </div>
        )}

        {tab === 'merge' && (
          <div className="batch-operation-section">
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              {messages.mergeHint}
            </p>
            <button
              className="icon-btn"
              disabled={!canSubmit || selectedCount < 2}
              onClick={() => {
                runAction(onMerge());
              }}
            >
              {messages.runMerge}
            </button>
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {messages.shortcutHint}
        </div>
        
        <div className="floating-panel-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      </div>
    </div>
  );
}

// Styles have been moved to global.css
