/**
 * SpeakerAssignPanel | 说话人批量指派面板
 *
 * 允许批量将选中语段指派给现有说话人，或新建说话人后立即指派
 * Allows batch-assigning selected utterances to an existing speaker, or creating a new one
 */

import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import type { SpeakerDocType } from '../../../db';

const PANEL_MIN_WIDTH = 292;
const PANEL_MIN_HEIGHT = 160;
const PANEL_MAX_WIDTH = 760;
const PANEL_MAX_HEIGHT = 560;
const PANEL_MARGIN = 8;
const PANEL_STORAGE_KEY = 'jieyu:speaker-assign-panel-rect';
const PANEL_DEFAULT_SIZE: PanelSize = { width: 360, height: 178 };

type PanelPosition = { x: number; y: number };
type PanelSize = { width: number; height: number };

export interface SpeakerAssignPanelProps {
  selectedCount: number;
  summary: string;
  batchSpeakerId: string;
  speakerOptions: SpeakerDocType[];
  speakerDraftName: string;
  speakerSaving: boolean;
  onBatchSpeakerIdChange: (id: string) => void;
  onAssign: () => void;
  onDraftNameChange: (name: string) => void;
  onCreateAndAssign: () => void;
}

export const SpeakerAssignPanel: FC<SpeakerAssignPanelProps> = ({
  selectedCount,
  summary,
  batchSpeakerId,
  speakerOptions,
  speakerDraftName,
  speakerSaving,
  onBatchSpeakerIdChange,
  onAssign,
  onDraftNameChange,
  onCreateAndAssign,
}) => {
  const [position, setPosition] = useState<PanelPosition>(() => {
    try {
      if (typeof window === 'undefined') return { x: 24, y: 24 };
      const stored = window.localStorage.getItem(PANEL_STORAGE_KEY);
      if (!stored) return { x: 24, y: 24 };
      const parsed: unknown = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return { x: 24, y: 24 };
      const p = parsed as { x?: unknown; y?: unknown };
      return {
        x: typeof p.x === 'number' ? p.x : 24,
        y: typeof p.y === 'number' ? p.y : 24,
      };
    } catch {
      return { x: 24, y: 24 };
    }
  });

  const [size, setSize] = useState<PanelSize>(() => {
    try {
      if (typeof window === 'undefined') return PANEL_DEFAULT_SIZE;
      const stored = window.localStorage.getItem(PANEL_STORAGE_KEY);
      if (!stored) return PANEL_DEFAULT_SIZE;
      const parsed: unknown = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return PANEL_DEFAULT_SIZE;
      const p = parsed as { width?: unknown; height?: unknown };
      return {
        width: typeof p.width === 'number' ? p.width : 360,
        height: typeof p.height === 'number' ? p.height : 178,
      };
    } catch {
      return PANEL_DEFAULT_SIZE;
    }
  });

  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  const clampSizeToViewport = useCallback((candidate: PanelSize): PanelSize => {
    if (typeof window === 'undefined') return candidate;
    return {
      width: Math.min(
        Math.max(Math.round(candidate.width), PANEL_MIN_WIDTH),
        Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, window.innerWidth - PANEL_MARGIN * 2)),
      ),
      height: Math.min(
        Math.max(Math.round(candidate.height), PANEL_MIN_HEIGHT),
        Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, window.innerHeight - PANEL_MARGIN * 2)),
      ),
    };
  }, []);

  const clampPositionToViewport = useCallback((candidate: PanelPosition, withSize: PanelSize): PanelPosition => {
    if (typeof window === 'undefined') return candidate;
    const maxX = Math.max(PANEL_MARGIN, window.innerWidth - withSize.width - PANEL_MARGIN);
    const maxY = Math.max(PANEL_MARGIN, window.innerHeight - withSize.height - PANEL_MARGIN);
    return {
      x: Math.min(Math.max(PANEL_MARGIN, Math.round(candidate.x)), maxX),
      y: Math.min(Math.max(PANEL_MARGIN, Math.round(candidate.y)), maxY),
    };
  }, []);

  const centerPanel = useCallback((withSize: PanelSize): void => {
    if (typeof window === 'undefined') return;
    const safeSize = clampSizeToViewport(withSize);
    setSize(safeSize);
    setPosition(clampPositionToViewport({
      x: Math.round((window.innerWidth - safeSize.width) / 2),
      y: Math.round((window.innerHeight - safeSize.height) / 2),
    }, safeSize));
  }, [clampPositionToViewport, clampSizeToViewport]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(PANEL_STORAGE_KEY);
    if (!stored) {
      // 首次展示时居中 | Center panel on first appearance
      centerPanel(size);
      return;
    }
    const safeSize = clampSizeToViewport(size);
    setSize(safeSize);
    setPosition((prev) => clampPositionToViewport(prev, safeSize));
    // 仅初始化一次，后续由拖拽/缩放与 window resize 维护约束 | Initialize once; later constraints are maintained by drag/resize and window resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      if (dragRef.current) {
        const nextX = dragRef.current.startLeft + (event.clientX - dragRef.current.startX);
        const nextY = dragRef.current.startTop + (event.clientY - dragRef.current.startY);
        setPosition(clampPositionToViewport({ x: nextX, y: nextY }, size));
        return;
      }

      if (resizeRef.current) {
        const rawWidth = resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX);
        const rawHeight = resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY);
        const maxWidthByViewport = Math.max(PANEL_MIN_WIDTH, window.innerWidth - position.x - PANEL_MARGIN);
        const maxHeightByViewport = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - position.y - PANEL_MARGIN);
        setSize(clampSizeToViewport({
          width: Math.min(rawWidth, Math.min(PANEL_MAX_WIDTH, maxWidthByViewport)),
          height: Math.min(rawHeight, Math.min(PANEL_MAX_HEIGHT, maxHeightByViewport)),
        }));
      }
    };

    const onPointerUp = (): void => {
      dragRef.current = null;
      resizeRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [clampPositionToViewport, clampSizeToViewport, position.x, position.y, size]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      }));
    } catch {
      // 忽略持久化失败 | Ignore persistence errors
    }
  }, [position.x, position.y, size.height, size.width]);

  useEffect(() => {
    const onResize = (): void => {
      const safeSize = clampSizeToViewport(size);
      setSize(safeSize);
      setPosition((prev) => clampPositionToViewport(prev, safeSize));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPositionToViewport, clampSizeToViewport, size]);

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: position.x,
      startTop: position.y,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';
  };

  const handleRecenter = (): void => {
    // 双击标题栏回到屏幕中间 | Double-click title to recenter panel
    centerPanel(size);
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
  };

  const handleResetPanelLayout = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(PANEL_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    centerPanel(PANEL_DEFAULT_SIZE);
  };

  return (
    <section
      className="speaker-assign-panel floating-panel"
      aria-label="说话人批量指派面板"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        minHeight: `${size.height}px`,
      }}
    >
      <div
        className="speaker-assign-title-row speaker-assign-drag-handle floating-panel-title-row floating-panel-drag-handle"
        onPointerDown={handleDragStart}
        onDoubleClick={handleRecenter}
        title="拖动移动，双击回中"
      >
        <strong>说话人轨道编辑</strong>
        <div className="floating-panel-title-actions">
          <span>已选 {selectedCount} 条</span>
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
        </div>
      </div>
      <p className="speaker-assign-summary">{summary}</p>
      <div className="speaker-assign-controls">
        <select
          className="speaker-assign-select"
          value={batchSpeakerId}
          onChange={(event) => onBatchSpeakerIdChange(event.target.value)}
          disabled={speakerSaving}
        >
          <option value="">未标注 / 清空说话人</option>
          {speakerOptions.map((speaker) => (
            <option key={speaker.id} value={speaker.id}>{speaker.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="speaker-assign-btn"
          onClick={onAssign}
          disabled={speakerSaving}
        >
          应用到已选
        </button>
      </div>
      <div className="speaker-assign-controls">
        <input
          className="speaker-assign-input"
          type="text"
          placeholder="新建说话人名称"
          value={speakerDraftName}
          onChange={(event) => onDraftNameChange(event.target.value)}
          disabled={speakerSaving}
        />
        <button
          type="button"
          className="speaker-assign-btn speaker-assign-btn-primary"
          onClick={onCreateAndAssign}
          disabled={speakerSaving || speakerDraftName.trim().length === 0}
        >
          新建并应用
        </button>
      </div>
      <div className="speaker-assign-resize-handle floating-panel-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
    </section>
  );
};
