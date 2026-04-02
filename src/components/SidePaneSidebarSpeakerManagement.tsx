import { useMemo, useState, type CSSProperties } from 'react';
import type { SpeakerRailContextValue } from '../contexts/SpeakerRailContext';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { fireAndForget } from '../utils/fireAndForget';
import { SidePaneActionModal } from './SidePaneActionModal';

function normalizeSpeakerName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-Hans-CN');
}

type SpeakerManagementRow = {
  key: string;
  name: string;
  count: number;
  projectCount: number;
  utteranceCount: number;
  segmentCount: number;
  isUnused: boolean;
  color?: string;
};

interface SidePaneSidebarSpeakerManagementProps {
  speakerCtx: SpeakerRailContextValue;
  messages: SidePaneSidebarMessages;
  onClose: () => void;
}

export function SidePaneSidebarSpeakerManagement({
  speakerCtx,
  messages,
  onClose,
}: SidePaneSidebarSpeakerManagementProps) {
  const [collapsedSpeakerGroupKeys, setCollapsedSpeakerGroupKeys] = useState<Set<string>>(new Set());

  const speakerFilterOptionByKey = useMemo(
    () => new Map(speakerCtx.speakerFilterOptions.map((option) => [option.key, option] as const)),
    [speakerCtx.speakerFilterOptions],
  );

  const speakerManagementRows = useMemo<SpeakerManagementRow[]>(() => (
    speakerCtx.speakerOptions.map((speaker) => {
      const activeOption = speakerFilterOptionByKey.get(speaker.id);
      const projectStats = speakerCtx.speakerReferenceStatsReady
        ? (speakerCtx.speakerReferenceStats[speaker.id] ?? {
          utteranceCount: 0,
          segmentCount: 0,
          totalCount: 0,
        })
        : {
          utteranceCount: 0,
          segmentCount: 0,
          totalCount: 0,
        };
      return {
        key: speaker.id,
        name: speaker.name,
        count: activeOption?.count ?? 0,
        projectCount: projectStats.totalCount,
        utteranceCount: projectStats.utteranceCount,
        segmentCount: projectStats.segmentCount,
        isUnused: speakerCtx.speakerReferenceStatsReady && projectStats.totalCount === 0,
        ...(activeOption?.color ? { color: activeOption.color } : {}),
      };
    })
  ), [speakerCtx.speakerOptions, speakerCtx.speakerReferenceStats, speakerCtx.speakerReferenceStatsReady, speakerFilterOptionByKey]);

  const unusedSpeakerCount = useMemo(
    () => speakerManagementRows.filter((row) => row.isUnused).length,
    [speakerManagementRows],
  );

  const projectReferencedSpeakerCount = useMemo(
    () => speakerManagementRows.filter((row) => row.projectCount > 0).length,
    [speakerManagementRows],
  );

  const duplicateSpeakerGroupCount = useMemo(() => {
    const groups = new Map<string, number>();
    for (const speaker of speakerCtx.speakerOptions) {
      const key = normalizeSpeakerName(speaker.name);
      if (!key) continue;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    return Array.from(groups.values()).filter((count) => count > 1).length;
  }, [speakerCtx.speakerOptions]);

  const duplicateSpeakerCountById = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const speaker of speakerCtx.speakerOptions) {
      const key = normalizeSpeakerName(speaker.name);
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push(speaker.id);
      groups.set(key, list);
    }

    const next = new Map<string, number>();
    for (const ids of groups.values()) {
      if (ids.length <= 1) continue;
      for (const id of ids) next.set(id, ids.length);
    }
    return next;
  }, [speakerCtx.speakerOptions]);

  const toggleSpeakerGroupCollapsed = (speakerKey: string) => {
    setCollapsedSpeakerGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(speakerKey)) next.delete(speakerKey);
      else next.add(speakerKey);
      return next;
    });
  };

  const runSpeakerPanelActionAndClose = (action: () => void | Promise<void>) => {
    fireAndForget((async () => {
      await action();
      onClose();
    })());
  };

  return (
    <SidePaneActionModal
      ariaLabel={messages.speakerManagementTitle}
      closeLabel={messages.cancelButton}
      onClose={onClose}
      className="side-pane-dialog-speaker"
    >
      <div className="speaker-management-panel-card transcription-side-pane-speaker-panel-section transcription-side-pane-speaker-panel-summary">
        <div className="speaker-management-panel-card-head">
          <strong className="transcription-side-pane-speaker-panel-title speaker-management-panel-card-title">{messages.speakerManagementTitle}</strong>
          <p className="speaker-management-panel-card-copy">{speakerCtx.selectedSpeakerSummary}</p>
        </div>
        <div className="transcription-side-pane-speaker-panel-meta">
          <span>{messages.speakerEntityCount(speakerCtx.speakerOptions.length)}</span>
          <span>{messages.speakerReferencedInScope(speakerCtx.speakerFilterOptions.length)}</span>
          <span>{speakerCtx.speakerReferenceStatsReady ? messages.speakerReferencedProject(projectReferencedSpeakerCount) : messages.speakerReferencedProjectPending}</span>
          <span>{speakerCtx.speakerReferenceStatsReady ? messages.speakerUnusedCount(unusedSpeakerCount) : messages.speakerUnusedCountPending}</span>
          <span>{messages.speakerDuplicateGroupCount(duplicateSpeakerGroupCount)}</span>
          <span>{messages.speakerSelectedUtteranceCount(speakerCtx.selectedUtteranceIds.size)}</span>
        </div>
        {speakerCtx.speakerReferenceStatsReady && unusedSpeakerCount > 0 && (
          <div className="speaker-management-dialog-actions speaker-management-dialog-actions-fill">
            <button
              className="btn"
              disabled={speakerCtx.speakerSaving}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleDeleteUnusedSpeakers); }}
              title={messages.speakerCleanupUnusedTitle}
            >
              {messages.speakerCleanupUnusedButton(unusedSpeakerCount)}
            </button>
          </div>
        )}
      </div>

      <div className="speaker-management-panel-card transcription-side-pane-speaker-panel-section">
        <div className="speaker-management-panel-card-head">
          <strong className="transcription-side-pane-speaker-panel-subtitle speaker-management-panel-card-title">{messages.speakerBatchAssignTitle}</strong>
        </div>
        <div className="speaker-management-panel-grid">
          <div className="dialog-field">
            <select
              className="input layer-action-dialog-input"
              value={speakerCtx.batchSpeakerId}
              onChange={(e) => speakerCtx.setBatchSpeakerId(e.target.value)}
              disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0}
            >
              <option value="">{messages.speakerTargetPlaceholder}</option>
              {speakerCtx.speakerOptions.map((speaker) => (
                <option key={speaker.id} value={speaker.id}>{speaker.name}</option>
              ))}
            </select>
          </div>
          <div className="speaker-management-dialog-actions speaker-management-dialog-actions-fill">
            <button
              className="btn"
              disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0 || speakerCtx.batchSpeakerId.trim().length === 0}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleAssignSpeakerToSelectedRouted); }}
            >
              {messages.speakerApplyButton}
            </button>
            <button
              className="btn btn-danger"
              disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleClearSpeakerOnSelectedRouted); }}
              title={messages.speakerClearTitle}
            >
              {messages.speakerClearButton}
            </button>
          </div>
        </div>
        <div className="speaker-management-panel-grid speaker-management-panel-grid-secondary">
          <div className="dialog-field">
            <input
              className="input layer-action-dialog-input"
              placeholder={messages.speakerDraftPlaceholder}
              value={speakerCtx.speakerDraftName}
              onChange={(e) => speakerCtx.setSpeakerDraftName(e.target.value)}
              disabled={speakerCtx.speakerSaving}
            />
          </div>
          <div className="speaker-management-dialog-actions speaker-management-dialog-actions-fill">
            <button
              className="btn"
              disabled={speakerCtx.speakerSaving || speakerCtx.speakerDraftName.trim().length === 0}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleCreateSpeakerOnly); }}
              title={messages.speakerCreateOnlyTitle}
            >
              {messages.speakerCreateOnlyButton}
            </button>
            <button
              className="btn"
              disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0 || speakerCtx.speakerDraftName.trim().length === 0}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleCreateSpeakerAndAssign); }}
              title={messages.speakerCreateAssignTitle}
            >
              {messages.speakerCreateAssignButton}
            </button>
          </div>
        </div>
      </div>

      <div className="speaker-management-panel-card transcription-side-pane-speaker-panel-section">
        <div className="speaker-management-panel-card-head">
          <strong className="speaker-management-panel-card-title">{messages.speakerFilterAria}</strong>
        </div>
        <div className="transcription-side-pane-speaker-filter" aria-label={messages.speakerFilterAria}>
          <button
            type="button"
            className={`transcription-side-pane-speaker-chip ${speakerCtx.activeSpeakerFilterKey === 'all' ? 'transcription-side-pane-speaker-chip-active' : ''}`}
            onClick={() => speakerCtx.setActiveSpeakerFilterKey('all')}
            title={messages.speakerFilterAllTitle}
          >
            {messages.speakerFilterAllLabel}
          </button>
          {speakerCtx.speakerFilterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`transcription-side-pane-speaker-chip ${speakerCtx.activeSpeakerFilterKey === option.key ? 'transcription-side-pane-speaker-chip-active' : ''}`}
              onClick={() => speakerCtx.setActiveSpeakerFilterKey(option.key)}
              title={`${option.name}（${option.count}）`}
              style={option.color ? ({ '--speaker-color': option.color } as CSSProperties) : undefined}
            >
              <span className="transcription-side-pane-speaker-dot" />
              <span className="transcription-side-pane-speaker-name">{option.name}</span>
              <span className="transcription-side-pane-speaker-count">{option.count}</span>
            </button>
          ))}
        </div>
      </div>

      {speakerManagementRows.length > 0 && (
        <div className="speaker-management-panel-card transcription-side-pane-speaker-panel-section transcription-side-pane-speaker-groups" aria-label={messages.speakerGroupAria}>
          <div className="speaker-management-panel-card-head">
            <strong className="speaker-management-panel-card-title">{messages.speakerGroupAria}</strong>
          </div>
          {speakerManagementRows.map((option) => {
            const isCollapsedGroup = collapsedSpeakerGroupKeys.has(option.key);
            const hasAssignmentsInScope = option.count > 0;
            const duplicateCount = duplicateSpeakerCountById.get(option.key) ?? 0;
            return (
              <div key={`group-${option.key}`} className="transcription-side-pane-speaker-group">
                <div className="transcription-side-pane-speaker-group-head" style={option.color ? ({ '--speaker-color': option.color } as CSSProperties) : undefined}>
                  <button
                    type="button"
                    className="transcription-side-pane-speaker-group-toggle"
                    onClick={() => toggleSpeakerGroupCollapsed(option.key)}
                    aria-expanded={!isCollapsedGroup}
                    title={isCollapsedGroup ? messages.speakerGroupExpand : messages.speakerGroupCollapse}
                  >
                    <span className="transcription-side-pane-speaker-dot" />
                    <span className="transcription-side-pane-speaker-name">{option.name}</span>
                    <span className="transcription-side-pane-speaker-count">{option.count}</span>
                  </button>
                  <div className="transcription-side-pane-speaker-group-actions">
                    <button
                      type="button"
                      className={`transcription-side-pane-speaker-mini-btn ${speakerCtx.activeSpeakerFilterKey === option.key ? 'transcription-side-pane-speaker-mini-btn-active' : ''}`}
                      onClick={() => { speakerCtx.setActiveSpeakerFilterKey(option.key); onClose(); }}
                      title={messages.speakerFocusTitle}
                      disabled={!hasAssignmentsInScope}
                    >
                      {messages.speakerFocusButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleSelectSpeakerUtterances(option.key); onClose(); }}
                      title={messages.speakerSelectAllTitle}
                      disabled={!hasAssignmentsInScope}
                    >
                      {messages.speakerSelectAllButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleClearSpeakerAssignments(option.key); onClose(); }}
                      title={messages.speakerDeleteTagTitle}
                      disabled={!hasAssignmentsInScope}
                    >
                      {messages.speakerDeleteTagButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleExportSpeakerSegments(option.key); onClose(); }}
                      title={messages.speakerExportTitle}
                      disabled={!hasAssignmentsInScope}
                    >
                      {messages.speakerExportButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleRenameSpeaker(option.key); onClose(); }}
                      title={messages.speakerRenameTitle}
                    >
                      {messages.speakerRenameButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleMergeSpeaker(option.key); onClose(); }}
                      title={messages.speakerMergeTitle}
                    >
                      {messages.speakerMergeButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn transcription-side-pane-speaker-mini-btn-danger"
                      onClick={() => { speakerCtx.handleDeleteSpeaker(option.key); onClose(); }}
                      title={messages.speakerDeleteEntityTitle}
                    >
                      {messages.speakerDeleteEntityButton}
                    </button>
                  </div>
                </div>
                {!isCollapsedGroup && (
                  <div className="transcription-side-pane-speaker-group-body">
                    <div>{hasAssignmentsInScope ? messages.speakerCurrentScopeCount(option.count) : messages.speakerCurrentScopeNone}</div>
                    <div>{speakerCtx.speakerReferenceStatsReady ? messages.speakerProjectRefCount(option.projectCount) : messages.speakerProjectRefPending}</div>
                    <div>{speakerCtx.speakerReferenceStatsReady ? messages.speakerAxisStats(option.utteranceCount, option.segmentCount) : messages.speakerAxisStatsPending}</div>
                    {option.isUnused && <div>{messages.speakerUnusedEntityHint}</div>}
                    {duplicateCount > 1 && <div>{messages.speakerDuplicateEntityHint(duplicateCount)}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SidePaneActionModal>
  );
}
