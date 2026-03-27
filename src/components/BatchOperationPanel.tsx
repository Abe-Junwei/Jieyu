import { useEffect, useMemo, useRef, useState } from 'react';
import type { UtteranceDocType } from '../db';
import { useDraggablePanel } from '../hooks/useDraggablePanel';

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
        conflicts.set(prev.id, '与相邻句段重叠');
      }
      if (selectedIds.has(current.id)) {
        conflicts.set(current.id, '与相邻句段重叠');
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
  defaultPreviewLayerId,
  onClose,
  onOffset,
  onScale,
  onSplitByRegex,
  onMerge,
  onJumpToUtterance,
}: BatchOperationPanelProps) {
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

  const preview = useMemo<PreviewResult>(() => {
    if (previewTargets.length === 0) {
      return {
        rows: [],
        blockingCount: 0,
        warningCount: 0,
        okCount: 0,
        globalMessage: '未选择句段，无法预览。',
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
          globalMessage: '偏移秒数不是有效数字。',
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
            detail: `偏移 ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`,
            level: 'error',
            conflict: '出现负时间',
          };
        }
        if (nextEnd - nextStart < MIN_SPAN) {
          return {
            id: u.id,
            originalValue: formatRange(u.startTime, u.endTime),
            nextValue: formatRange(nextStart, nextEnd),
            detail: `偏移 ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`,
            level: 'error',
            conflict: '句段时长过短',
          };
        }
        return {
          id: u.id,
          originalValue: formatRange(u.startTime, u.endTime),
          nextValue: formatRange(nextStart, nextEnd),
          detail: `偏移 ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`,
          level: 'ok',
          conflict: '无',
        };
      });

      const overlapConflicts = buildOverlapConflicts(
        allUtterancesOnMedia,
        transformed,
        new Set(previewTargets.map((u) => u.id)),
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
        globalMessage: stats.blockingCount > 0 ? '存在阻断冲突，执行会失败。' : '预览通过，可执行。',
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
          globalMessage: '缩放系数必须大于 0。',
        };
      }
      const parsedAnchor = anchorTime.trim() ? Number(anchorTime) : undefined;
      if (anchorTime.trim() && !Number.isFinite(parsedAnchor ?? Number.NaN)) {
        return {
          rows: [],
          blockingCount: 1,
          warningCount: 0,
          okCount: 0,
          globalMessage: '锚点时间不是有效数字。',
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
            detail: `系数 x${factor.toFixed(3)}，锚点 ${pivot.toFixed(3)}s`,
            level: 'error',
            conflict: '出现负时间',
          };
        }
        if (nextEnd - nextStart < MIN_SPAN) {
          return {
            id: u.id,
            originalValue: formatRange(u.startTime, u.endTime),
            nextValue: formatRange(nextStart, nextEnd),
            detail: `系数 x${factor.toFixed(3)}，锚点 ${pivot.toFixed(3)}s`,
            level: 'error',
            conflict: '句段时长过短',
          };
        }
        return {
          id: u.id,
          originalValue: formatRange(u.startTime, u.endTime),
          nextValue: formatRange(nextStart, nextEnd),
          detail: `系数 x${factor.toFixed(3)}，锚点 ${pivot.toFixed(3)}s`,
          level: 'ok',
          conflict: '无',
        };
      });

      const overlapConflicts = buildOverlapConflicts(
        allUtterancesOnMedia,
        transformed,
        new Set(previewTargets.map((u) => u.id)),
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
        globalMessage: stats.blockingCount > 0 ? '存在阻断冲突，执行会失败。' : '预览通过，可执行。',
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
          globalMessage: '正则表达式不能为空。',
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
          globalMessage: '正则表达式无效。',
        };
      }

      const rows: PreviewRow[] = previewTargets.map((u) => {
        const text = (activeUtteranceTextById[u.id] ?? '').trim();
        if (!text) {
          return {
            id: u.id,
            originalValue: formatRange(u.startTime, u.endTime),
            nextValue: '-',
            detail: '原文本为空',
            level: 'warning',
            conflict: '会被跳过',
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
            detail: `匹配后仅 ${segments.length} 段`,
            level: 'warning',
            conflict: '会被跳过',
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
            detail: `${segments.length} 段，但分片过短`,
            level: 'warning',
            conflict: '会被跳过',
          };
        }

        const nextValue = bounds
          .slice(0, 2)
          .map((b) => formatRange(b.start, b.end))
          .join(' | ');
        const truncatedHint = bounds.length > 2 ? ` ... 共 ${bounds.length} 段` : '';
        const textHint = segments.slice(0, 2).join(' / ');

        return {
          id: u.id,
          originalValue: formatRange(u.startTime, u.endTime),
          nextValue: `${nextValue}${truncatedHint}`,
          detail: `文本: ${textHint}${segments.length > 2 ? ' ...' : ''}`,
          level: 'ok',
          conflict: '无',
        };
      });

      const stats = countLevels(rows);
      return {
        rows,
        ...stats,
        globalMessage: stats.okCount > 0 ? '已生成拆分预览。' : '没有可拆分条目。',
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
          detail: '至少选中 2 条',
          level: 'error',
          conflict: '数量不足',
        };
      }
      if (index === 0) {
        return {
          id: u.id,
          originalValue: formatRange(u.startTime, u.endTime),
          nextValue: formatRange(first.startTime, last.endTime),
          detail: '保留并扩展到选区末尾',
          level: 'ok',
          conflict: '无',
        };
      }
      return {
        id: u.id,
        originalValue: formatRange(u.startTime, u.endTime),
        nextValue: `并入 ${first.id}`,
        detail: '该句段会被删除并迁移译文',
        level: 'ok',
        conflict: '无',
      };
    });

    const stats = countLevels(rows);
    return {
      rows,
      ...stats,
      globalMessage: stats.blockingCount > 0 ? '合并条件不满足。' : '预览通过，可执行。',
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
          <strong>批量句段操作</strong>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              type="button"
              className="floating-panel-reset-btn"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleResetPanelLayout}
              aria-label="重置位置与尺寸"
              title="重置位置与尺寸"
            >
              ↺
            </button>
            <button className="icon-btn" onClick={onClose} title="关闭" onPointerDown={(e) => e.stopPropagation()}>✕</button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#4b5563' }}>
          当前选中：{selectedCount} 个句段
        </div>

        <div className="batch-operation-section" style={{ gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="ai-cfg-label">预览范围</label>
            <select
              aria-label="预览范围"
              value={previewScope}
              onChange={(e) => setPreviewScope(e.target.value as PreviewScope)}
              className="ai-cfg-input"
              style={{ minWidth: 170 }}
            >
              <option value="selected">仅已选句段</option>
              <option value="layer-all">特定层全部句段</option>
            </select>

            <label className="ai-cfg-label">预览层</label>
            <select
              aria-label="预览层"
              value={previewLayerId}
              onChange={(e) => setPreviewLayerId(e.target.value)}
              disabled={previewLayerOptions.length === 0}
              className="ai-cfg-input"
              style={{ minWidth: 220 }}
            >
              {previewLayerOptions.length === 0 && <option value="">当前层</option>}
              {previewLayerOptions.map((layer) => (
                <option key={layer.id} value={layer.id}>{layer.label}</option>
              ))}
            </select>
          </div>
          {previewScope === 'layer-all' && (
            <div style={{ fontSize: 12, color: '#475569' }}>
              已切换为层级全量预览（{previewTargets.length} 条）。执行仍只作用于当前选中句段。
            </div>
          )}
        </div>

        <div className="batch-operation-preview-card">
          <div className="batch-operation-preview-header">
            <strong>逐条预览</strong>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
              <span style={{ color: '#166534' }}>通过 {preview.okCount}</span>
              <span style={{ color: '#92400e' }}>警告 {preview.warningCount}</span>
              <span style={{ color: '#b91c1c' }}>阻断 {preview.blockingCount}</span>
              {(showOnlyConflicts || preview.warningCount > 0 || preview.blockingCount > 0) && (
                <button
                  className="icon-btn"
                  onClick={() => setShowOnlyConflicts((v) => !v)}
                  style={{ fontSize: 11, padding: '1px 6px' }}
                >
                  {showOnlyConflicts ? '显示全部' : '只看冲突'}
                </button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12, color: preview.blockingCount > 0 ? '#991b1b' : '#334155' }}>
            {preview.globalMessage}
          </div>
          <div className="batch-operation-table-wrap">
            <table className="batch-operation-table">
              <thead>
                <tr>
                  <th className="batch-operation-th">#</th>
                  <th className="batch-operation-th">句段 ID</th>
                  <th className="batch-operation-th">句段内容</th>
                  <th className="batch-operation-th">原值</th>
                  <th className="batch-operation-th">新值</th>
                  <th className="batch-operation-th">说明</th>
                  <th className="batch-operation-th">冲突标记</th>
                  {onJumpToUtterance && <th className="batch-operation-th">跳转</th>}
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
                        {(activeUtteranceTextById[row.id] ?? '').trim() || '-'}
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
                            跳转
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                {preview.rows.filter((r) => !showOnlyConflicts || r.level !== 'ok').length === 0 && (
                  <tr>
                    <td className="batch-operation-td" colSpan={onJumpToUtterance ? 8 : 7}>暂无可展示的预览行</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`icon-btn ${tab === 'offset' ? 'icon-btn-active' : ''}`} onClick={() => setTab('offset')}>时间偏移</button>
          <button className={`icon-btn ${tab === 'scale' ? 'icon-btn-active' : ''}`} onClick={() => setTab('scale')}>时间缩放</button>
          <button className={`icon-btn ${tab === 'split' ? 'icon-btn-active' : ''}`} onClick={() => setTab('split')}>正则拆分</button>
          <button className={`icon-btn ${tab === 'merge' ? 'icon-btn-active' : ''}`} onClick={() => setTab('merge')}>批量合并</button>
        </div>

        {tab === 'offset' && (
          <div className="batch-operation-section">
            <label className="ai-cfg-label">偏移秒数（可负数）</label>
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
              执行偏移
            </button>
          </div>
        )}

        {tab === 'scale' && (
          <div className="batch-operation-section">
            <label className="ai-cfg-label">缩放系数（{'>'} 0）</label>
            <input value={scaleFactor} onChange={(e) => setScaleFactor(e.target.value)} className="ai-cfg-input" />
            <label className="ai-cfg-label">锚点时间（可选，秒）</label>
            <input value={anchorTime} onChange={(e) => setAnchorTime(e.target.value)} className="ai-cfg-input" placeholder="默认取第一个选中句段起点" />
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
              执行缩放
            </button>
          </div>
        )}

        {tab === 'split' && (
          <div className="batch-operation-section">
            <label className="ai-cfg-label">正则表达式</label>
            <input value={regexPattern} onChange={(e) => setRegexPattern(e.target.value)} className="ai-cfg-input" />
            <label className="ai-cfg-label">Flags（可选，如 i）</label>
            <input value={regexFlags} onChange={(e) => setRegexFlags(e.target.value)} className="ai-cfg-input" />
            <button
              className="icon-btn"
              disabled={!canSubmit}
              onClick={() => {
                if (!regexPattern.trim()) return;
                runAction(onSplitByRegex(regexPattern, regexFlags));
              }}
            >
              执行拆分
            </button>
          </div>
        )}

        {tab === 'merge' && (
          <div className="batch-operation-section">
            <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>
              将选中句段按时间顺序合并为一个句段（允许非连续选择）。
            </p>
            <button
              className="icon-btn"
              disabled={!canSubmit || selectedCount < 2}
              onClick={() => {
                runAction(onMerge());
              }}
            >
              执行合并
            </button>
          </div>
        )}

        <div style={{ fontSize: 12, color: '#6b7280' }}>
          快捷键：Cmd/Ctrl + Shift + B 打开此面板
        </div>
        
        <div className="floating-panel-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      </div>
    </div>
  );
}

// Styles have been moved to global.css
