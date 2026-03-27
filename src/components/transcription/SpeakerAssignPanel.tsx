/**
 * SpeakerAssignPanel | 说话人批量指派面板
 *
 * 允许批量将选中语段指派给现有说话人，或新建说话人后立即指派
 * Allows batch-assigning selected utterances to an existing speaker, or creating a new one
 */

import { type FC } from 'react';
import type { SpeakerDocType } from '../../db';
import { useDraggablePanel } from '../../hooks/useDraggablePanel';

const PANEL_MIN_WIDTH = 292;
const PANEL_MIN_HEIGHT = 178;
const PANEL_MAX_WIDTH = 640;
const PANEL_MAX_HEIGHT = 480;
const PANEL_MARGIN = 12;
const PANEL_DEFAULT_SIZE = { width: 360, height: 178 };
const PANEL_STORAGE_KEY = 'jieyu:speaker-assign-panel-rect';

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
  const {
    position,
    size,
    handleDragStart,
    handleResizeStart,
    handleRecenter,
    handleResetPanelLayout,
  } = useDraggablePanel({
    storageKey: PANEL_STORAGE_KEY,
    defaultSize: PANEL_DEFAULT_SIZE,
    minWidth: PANEL_MIN_WIDTH,
    minHeight: PANEL_MIN_HEIGHT,
    maxWidth: PANEL_MAX_WIDTH,
    maxHeight: PANEL_MAX_HEIGHT,
    margin: PANEL_MARGIN,
  });

  return (
    <section
      className="speaker-assign-panel floating-panel"
      aria-label="说话人批量指派面板"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
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
      <div className="floating-panel-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
    </section>
  );
};
