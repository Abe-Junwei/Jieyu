type TrackFocusToolbarControlsProps = {
  trackModeLabel?: string;
  laneLockCount?: number;
  lockConflictCount?: number;
  lockConflictSpeakerNames?: string[];
  trackConflictLabel?: string;
  onOpenLockConflictDetails?: () => void;
  speakerFocusMode?: 'all' | 'focus-soft' | 'focus-hard';
  speakerFocusTargetName?: string;
  speakerFocusOptions?: Array<{ key: string; name: string }>;
  speakerFocusTargetKey?: string;
  onSpeakerFocusTargetKeyChange?: (speakerKey: string) => void;
  onCycleSpeakerFocusMode?: () => void;
};

export function TrackFocusToolbarControls({
  trackModeLabel,
  laneLockCount,
  lockConflictCount,
  lockConflictSpeakerNames,
  trackConflictLabel,
  onOpenLockConflictDetails,
  speakerFocusMode,
  speakerFocusTargetName,
  speakerFocusOptions,
  speakerFocusTargetKey,
  onSpeakerFocusTargetKeyChange,
  onCycleSpeakerFocusMode,
}: TrackFocusToolbarControlsProps) {
  const speakerFocusLabel = speakerFocusMode === 'focus-hard'
    ? `仅${speakerFocusTargetName ?? '目标'}`
    : speakerFocusMode === 'focus-soft'
      ? `柔和${speakerFocusTargetName ? `·${speakerFocusTargetName}` : ''}`
      : '全部';

  if (!trackModeLabel && !onCycleSpeakerFocusMode && !(lockConflictCount != null && lockConflictCount > 0)) {
    return null;
  }

  return (
    <div className="track-focus-toolbar-controls">
      {trackModeLabel && (
        <span
          className="toolbar-track-mode-badge"
          title={`当前轨道模式：${trackModeLabel} | Current track mode: ${trackModeLabel}`}
        >
          轨道：{trackModeLabel}（已分配 {laneLockCount ?? 0}）
        </span>
      )}
      {lockConflictCount != null && lockConflictCount > 0 && (
        <button
          type="button"
          className="toolbar-lock-conflict-badge"
          onClick={onOpenLockConflictDetails}
          title={`${trackConflictLabel ?? '轨道冲突'} ${lockConflictCount} 项：${(lockConflictSpeakerNames ?? []).join('、') || '未知说话人'} | ${lockConflictCount} track conflicts`}
        >
          轨冲突：{lockConflictCount}
        </button>
      )}
      {onCycleSpeakerFocusMode && (
        <>
          <button
            type="button"
            className={`toolbar-focus-mode-badge${speakerFocusMode && speakerFocusMode !== 'all' ? ' toolbar-focus-mode-badge-active' : ''}`}
            title={`说话人聚焦：${speakerFocusLabel}（点击切换） | Speaker focus: ${speakerFocusLabel} (click to cycle)`}
            onClick={onCycleSpeakerFocusMode}
          >
            聚焦：{speakerFocusLabel}
          </button>
          {onSpeakerFocusTargetKeyChange && (
            <select
              className="toolbar-focus-target-select"
              title="选择聚焦说话人 | Select focus speaker"
              value={speakerFocusTargetKey ?? ''}
              onChange={(event) => onSpeakerFocusTargetKeyChange(event.target.value)}
            >
              <option value="">跟随当前选中</option>
              {(speakerFocusOptions ?? []).map((option) => (
                <option key={option.key} value={option.key}>{option.name}</option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  );
}