import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';

type LayerActionType = 'create-transcription' | 'create-translation' | 'delete';

interface LayerActionPopoverProps {
  action: LayerActionType;
  layerId: string | undefined;
  deletableLayers: Array<{ id: string; name?: { zho?: string; zh?: string; eng?: string; en?: string }; key: string }>;
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  deleteLayer: (layerId: string) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
  checkLayerHasContent?: (layerId: string) => Promise<number>;
  onClose: () => void;
}

const COMMON_LANGUAGES = [
  { code: 'cmn', label: '普通话' },
  { code: 'zho', label: '中文' },
  { code: 'yue', label: '粤语' },
  { code: 'wuu', label: '吴语' },
  { code: 'nan', label: '闽南语' },
  { code: 'hak', label: '客家话' },
  { code: 'eng', label: 'English' },
  { code: 'jpn', label: '日本語' },
  { code: 'kor', label: '한국어' },
  { code: 'fra', label: 'Français' },
  { code: 'deu', label: 'Deutsch' },
  { code: 'spa', label: 'Español' },
  { code: 'rus', label: 'Русский' },
  { code: 'ara', label: 'العربية' },
  { code: 'por', label: 'Português' },
  { code: 'hin', label: 'हिन्दी' },
  { code: 'vie', label: 'Tiếng Việt' },
  { code: 'tha', label: 'ภาษาไทย' },
  { code: 'msa', label: 'Bahasa Melayu' },
  { code: 'ind', label: 'Bahasa Indonesia' },
];

const PANEL_MIN_WIDTH = 280;
const PANEL_MIN_HEIGHT = 180;
const PANEL_MAX_WIDTH = 760;
const PANEL_MAX_HEIGHT = 560;
const PANEL_MARGIN = 8;
const PANEL_DEFAULT_SIZE: PanelSize = { width: 360, height: 240 };

type PanelPosition = { x: number; y: number };
type PanelSize = { width: number; height: number };

export function LayerActionPopover({
  action,
  layerId,
  deletableLayers,
  createLayer,
  deleteLayer,
  deleteLayerWithoutConfirm,
  checkLayerHasContent,
  onClose,
}: LayerActionPopoverProps) {
  const storageKey = `jieyu:layer-action-popover-rect:${action}`;
  const [langId, setLangId] = useState('');
  const [customLang, setCustomLang] = useState('');
  const [alias, setAlias] = useState('');
  const [modality, setModality] = useState<'text' | 'audio' | 'mixed'>('text');
  const [deleteLayerId, setDeleteLayerId] = useState(layerId ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ layerId: string; layerName: string; textCount: number } | null>(null);
  const [position, setPosition] = useState<PanelPosition>(() => {
    try {
      if (typeof window === 'undefined') return { x: 24, y: 24 };
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return { x: 24, y: 24 };
      const parsed: unknown = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return { x: 24, y: 24 };
      const p = parsed as { x?: unknown; y?: unknown };
      return {
        x: typeof p.x === 'number' ? p.x : 24,
        y: typeof p.y === 'number' ? p.y : 24,
      };
    } catch (err) {
      console.error('[Jieyu] LayerActionPopover: failed to read position from localStorage, using default', { storageKey, err });
      return { x: 24, y: 24 };
    }
  });
  const [size, setSize] = useState<PanelSize>(() => {
    try {
      if (typeof window === 'undefined') return PANEL_DEFAULT_SIZE;
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return PANEL_DEFAULT_SIZE;
      const parsed: unknown = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return PANEL_DEFAULT_SIZE;
      const p = parsed as { width?: unknown; height?: unknown };
      return {
        width: typeof p.width === 'number' ? p.width : 360,
        height: typeof p.height === 'number' ? p.height : 240,
      };
    } catch (err) {
      console.error('[Jieyu] LayerActionPopover: failed to read size from localStorage, using default', { storageKey, err });
      return PANEL_DEFAULT_SIZE;
    }
  });
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const initializedStorageKeyRef = useRef<string | null>(null);

  // Sync deleteLayerId when layerId changes
  useEffect(() => {
    if (layerId) setDeleteLayerId(layerId);
  }, [layerId]);

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
    if (initializedStorageKeyRef.current === storageKey) return;
    initializedStorageKeyRef.current = storageKey;
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      // 首次展示时居中 | Center panel on first appearance
      centerPanel(size);
      return;
    }
    const safeSize = clampSizeToViewport(size);
    setSize(safeSize);
    setPosition((prev) => clampPositionToViewport(prev, safeSize));
    // 仅对当前 storageKey 初始化一次，后续由拖拽/缩放与 window resize 维护约束 | Init once per storage key; later constraints are maintained by drag/resize and window resize
  }, [centerPanel, clampPositionToViewport, clampSizeToViewport, size, storageKey]);

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
      window.localStorage.setItem(storageKey, JSON.stringify({
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      }));
    } catch (err) {
      console.error('[Jieyu] LayerActionPopover: failed to persist panel rect to localStorage', { storageKey, err });
    }
  }, [position.x, position.y, size.height, size.width, storageKey]);

  useEffect(() => {
    const onResize = (): void => {
      const safeSize = clampSizeToViewport(size);
      setSize(safeSize);
      setPosition((prev) => clampPositionToViewport(prev, safeSize));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPositionToViewport, clampSizeToViewport, size]);

  const handleCreate = useCallback(async () => {
    const resolvedLang = langId === '__custom__' ? customLang.trim() : langId;
    if (!resolvedLang) return;
    setIsLoading(true);
    await createLayer(action === 'create-transcription' ? 'transcription' : 'translation', {
      languageId: resolvedLang,
      ...(alias.trim() ? { alias: alias.trim() } : {}),
    }, action === 'create-translation' ? modality : undefined);
    setIsLoading(false);
    onClose();
  }, [langId, customLang, alias, modality, action, createLayer, onClose]);

  const handleDelete = useCallback(async () => {
    if (!deleteLayerId) return;
    const layer = deletableLayers.find((l) => l.id === deleteLayerId);
    const layerName = layer?.name?.zho ?? layer?.name?.zh ?? layer?.name?.eng ?? layer?.name?.en ?? layer?.key ?? deleteLayerId;

    // Check if layer has content
    const textCount = checkLayerHasContent ? await checkLayerHasContent(deleteLayerId) : 0;

    if (textCount === 0) {
      // No content - delete directly
      setIsLoading(true);
      await (deleteLayerWithoutConfirm ?? deleteLayer)(deleteLayerId);
      setIsLoading(false);
      onClose();
    } else {
      // Has content - show confirmation
      setDeleteConfirm({ layerId: deleteLayerId, layerName, textCount });
    }
  }, [deleteLayerId, deletableLayers, checkLayerHasContent, deleteLayerWithoutConfirm, deleteLayer, onClose]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setIsLoading(true);
    await (deleteLayerWithoutConfirm ?? deleteLayer)(deleteConfirm.layerId);
    setIsLoading(false);
    setDeleteConfirm(null);
    onClose();
  }, [deleteConfirm, deleteLayerWithoutConfirm, deleteLayer, onClose]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

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

  const handleRecenter = (): void => {
    // 双击标题栏回到屏幕中间 | Double-click title to recenter panel
    centerPanel(size);
  };

  const handleResetPanelLayout = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(storageKey);
      } catch (err) {
        console.error('[Jieyu] LayerActionPopover: failed to remove panel rect from localStorage', { storageKey, err });
      }
    }
    centerPanel(PANEL_DEFAULT_SIZE);
  };

  const label = action === 'create-transcription'
    ? '新建转写层'
    : action === 'create-translation'
    ? '新建翻译层'
    : '删除层';

  const popover = (
    <div
      className="layer-action-popover-backdrop"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="layer-action-popover-card floating-panel"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          minHeight: `${size.height}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div
          className="layer-action-popover-title floating-panel-title-row floating-panel-drag-handle"
          onPointerDown={handleDragStart}
          onDoubleClick={handleRecenter}
          title="拖动移动，双击回中"
        >
          <span>{label}</span>
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

        {action === 'delete' ? (
          <>
            {deleteConfirm ? (
              // Delete confirmation view
              <>
                <p style={{ margin: '0 0 12px', color: '#334155', fontSize: 14 }}>
                  层「{deleteConfirm.layerName}」包含 {deleteConfirm.textCount} 条文本记录，删除后将无法恢复。
                </p>
                <div className="transcription-layer-rail-action-row">
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={isLoading}
                    onClick={handleConfirmDelete}
                  >
                    确认删除
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={handleCancelDelete} disabled={isLoading}>
                    取消
                  </button>
                </div>
              </>
            ) : (
              // Delete selection view
              <>
                <select
                  className="input transcription-layer-rail-action-input"
                  value={deleteLayerId}
                  onChange={(e) => setDeleteLayerId(e.target.value)}
                >
                  {deletableLayers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name?.zho ?? l.name?.zh ?? l.name?.eng ?? l.name?.en ?? l.key}
                    </option>
                  ))}
                </select>
                <div className="transcription-layer-rail-action-row">
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={!deleteLayerId || isLoading}
                    onClick={handleDelete}
                  >
                    删除
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={onClose}>
                    取消
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <select
              className="input transcription-layer-rail-action-input"
              value={langId}
              onChange={(e) => setLangId(e.target.value)}
            >
              <option value="">选择语言…</option>
              {COMMON_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}（{lang.code}）
                </option>
              ))}
              <option value="__custom__">其他（手动输入）</option>
            </select>
            {langId === '__custom__' && (
              <input
                className="input transcription-layer-rail-action-input"
                placeholder="ISO 639-3 代码（如 tib）"
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
              />
            )}
            <input
              className="input transcription-layer-rail-action-input"
              placeholder="别名（可选）"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
            {action === 'create-translation' && (
              <select
                className="input transcription-layer-rail-action-input"
                value={modality}
                onChange={(e) => setModality(e.target.value as 'text' | 'audio' | 'mixed')}
              >
                <option value="text">文本（纯文字翻译）</option>
                <option value="audio">语音（口译录音）</option>
                <option value="mixed">混合（文字 + 录音）</option>
              </select>
            )}
            <div className="transcription-layer-rail-action-row">
              <button
                className="btn btn-sm"
                disabled={!langId || isLoading}
                onClick={handleCreate}
              >
                创建
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                取消
              </button>
            </div>
          </>
        )}
        <div className="floating-panel-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      </div>
    </div>
  );

  return ReactDOM.createPortal(popover, document.body);
}
