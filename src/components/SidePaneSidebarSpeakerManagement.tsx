import { useId, useMemo, useState, type CSSProperties } from 'react';
import type { SpeakerRailContextValue } from '../contexts/SpeakerRailContext';
import type { SidePaneSidebarMessages } from '../i18n/messages';
import { fireAndForget } from '../utils/fireAndForget';
import { SidePaneActionModal } from './SidePaneActionModal';
import { ActionButtonGroup, FormField, PanelButton, PanelChip } from './ui';
import { PanelSection } from './ui/PanelSection';
import { PanelSummary } from './ui/PanelSummary';

function normalizeSpeakerName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-Hans-CN');
}

type SpeakerManagementRow = {
  key: string;
  name: string;
  count: number;
  projectCount: number;
  transcriptionUnitCount: number;
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
  const fieldIdPrefix = useId();

  const speakerFilterOptionByKey = useMemo(
    () => new Map(speakerCtx.speakerFilterOptions.map((option) => [option.key, option] as const)),
    [speakerCtx.speakerFilterOptions],
  );

  const speakerManagementRows = useMemo<SpeakerManagementRow[]>(() => (
    speakerCtx.speakerOptions.map((speaker) => {
      const activeOption = speakerFilterOptionByKey.get(speaker.id);
      const projectStats = speakerCtx.speakerReferenceStatsReady
        ? (speakerCtx.speakerReferenceStats[speaker.id] ?? {
          transcriptionUnitCount: 0,
          segmentCount: 0,
          totalCount: 0,
        })
        : {
          transcriptionUnitCount: 0,
          segmentCount: 0,
          totalCount: 0,
        };
      return {
        key: speaker.id,
        name: speaker.name,
        count: activeOption?.count ?? 0,
        projectCount: projectStats.totalCount,
        transcriptionUnitCount: projectStats.transcriptionUnitCount,
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
    })(), { context: 'src/components/SidePaneSidebarSpeakerManagement.tsx:L119', policy: 'user-visible' });
  };

  return (
    <SidePaneActionModal
      ariaLabel={messages.speakerManagementTitle}
      closeLabel={messages.cancelButton}
      onClose={onClose}
      className="side-pane-dialog-speaker"
      footer={(
        <div className="speaker-management-footer-actions">
          <PanelButton
            variant="ghost"
            onClick={onClose}
          >
            {messages.cancelButton}
          </PanelButton>
          <PanelButton
            variant="primary"
            onClick={onClose}
          >
            {messages.closeButton}
          </PanelButton>
        </div>
      )}
    >
      <PanelSummary
        className="speaker-management-panel-card transcription-side-pane-speaker-panel-section transcription-side-pane-speaker-panel-summary"
        description={speakerCtx.selectedSpeakerSummary}
        meta={(
          <div className="transcription-side-pane-speaker-panel-meta panel-meta">
            <PanelChip>{messages.speakerEntityCount(speakerCtx.speakerOptions.length)}</PanelChip>
            <PanelChip>{messages.speakerReferencedInScope(speakerCtx.speakerFilterOptions.length)}</PanelChip>
            {speakerCtx.speakerReferenceStatsReady ? (
              <PanelChip>{messages.speakerStatsScopeLabel(speakerCtx.speakerReferenceStatsMediaScoped)}</PanelChip>
            ) : null}
            <PanelChip>{speakerCtx.speakerReferenceStatsReady ? messages.speakerReferencedProject(projectReferencedSpeakerCount) : messages.speakerReferencedProjectPending}</PanelChip>
            <PanelChip>{speakerCtx.speakerReferenceStatsReady ? messages.speakerUnusedCount(unusedSpeakerCount) : messages.speakerUnusedCountPending}</PanelChip>
            <PanelChip>{messages.speakerDuplicateGroupCount(duplicateSpeakerGroupCount)}</PanelChip>
            <PanelChip>{messages.speakerSelectedUnitCount(speakerCtx.selectedUnitIds.size)}</PanelChip>
          </div>
        )}
      >
        {speakerCtx.speakerReferenceStatsReady && speakerCtx.speakerReferenceUnassignedStats.totalCount > 0 ? (
          <div className="speaker-management-unassigned-hint transcription-side-pane-speaker-panel-section">
            {messages.speakerUnassignedAxisStats(
              speakerCtx.speakerReferenceUnassignedStats.transcriptionUnitCount,
              speakerCtx.speakerReferenceUnassignedStats.segmentCount,
            )}
          </div>
        ) : null}
        {speakerCtx.speakerReferenceStatsReady && unusedSpeakerCount > 0 && (
          <ActionButtonGroup className="speaker-management-dialog-actions speaker-management-dialog-actions-fill">
            <PanelButton
              disabled={speakerCtx.speakerSaving}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleDeleteUnusedSpeakers); }}
              title={messages.speakerCleanupUnusedTitle}
            >
              {messages.speakerCleanupUnusedButton(unusedSpeakerCount)}
            </PanelButton>
          </ActionButtonGroup>
        )}
      </PanelSummary>

      <PanelSection className="speaker-management-panel-card transcription-side-pane-speaker-panel-section" title={messages.speakerBatchAssignTitle}>
        <div className="speaker-management-panel-grid">
          <FormField htmlFor={`${fieldIdPrefix}-batch-speaker`} label={messages.speakerTargetPlaceholder}>
            <select
              id={`${fieldIdPrefix}-batch-speaker`}
              className="input layer-action-dialog-input speaker-management-control"
              value={speakerCtx.batchSpeakerId}
              onChange={(e) => speakerCtx.setBatchSpeakerId(e.target.value)}
              disabled={speakerCtx.speakerSaving || speakerCtx.selectedUnitIds.size === 0}
            >
              <option value="">{messages.speakerTargetPlaceholder}</option>
              {speakerCtx.speakerOptions.map((speaker) => (
                <option key={speaker.id} value={speaker.id}>{speaker.name}</option>
              ))}
            </select>
          </FormField>
          <ActionButtonGroup className="speaker-management-dialog-actions speaker-management-dialog-actions-fill">
            <PanelButton
              variant="primary"
              disabled={speakerCtx.speakerSaving || speakerCtx.selectedUnitIds.size === 0 || speakerCtx.batchSpeakerId.trim().length === 0}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleAssignSpeakerToSelectedRouted); }}
            >
              {messages.speakerApplyButton}
            </PanelButton>
            <PanelButton
              disabled={speakerCtx.speakerSaving || speakerCtx.selectedUnitIds.size === 0}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleClearSpeakerOnSelectedRouted); }}
              title={messages.speakerClearTitle}
            >
              {messages.speakerClearButton}
            </PanelButton>
          </ActionButtonGroup>
        </div>
        <div className="speaker-management-panel-grid speaker-management-panel-grid-secondary">
          <FormField htmlFor={`${fieldIdPrefix}-speaker-draft`} label={messages.speakerDraftPlaceholder}>
            <input
              id={`${fieldIdPrefix}-speaker-draft`}
              className="input layer-action-dialog-input speaker-management-control"
              placeholder={messages.speakerDraftPlaceholder}
              value={speakerCtx.speakerDraftName}
              onChange={(e) => speakerCtx.setSpeakerDraftName(e.target.value)}
              disabled={speakerCtx.speakerSaving}
            />
          </FormField>
          <ActionButtonGroup className="speaker-management-dialog-actions speaker-management-dialog-actions-fill">
            <PanelButton
              disabled={speakerCtx.speakerSaving || speakerCtx.speakerDraftName.trim().length === 0}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleCreateSpeakerOnly); }}
              title={messages.speakerCreateOnlyTitle}
            >
              {messages.speakerCreateOnlyButton}
            </PanelButton>
            <PanelButton
              variant="primary"
              disabled={speakerCtx.speakerSaving || speakerCtx.selectedUnitIds.size === 0 || speakerCtx.speakerDraftName.trim().length === 0}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleCreateSpeakerAndAssign); }}
              title={messages.speakerCreateAssignTitle}
            >
              {messages.speakerCreateAssignButton}
            </PanelButton>
          </ActionButtonGroup>
        </div>
      </PanelSection>

      <PanelSection className="speaker-management-panel-card transcription-side-pane-speaker-panel-section" title={messages.speakerFilterAria}>
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
      </PanelSection>

      {speakerManagementRows.length > 0 && (
        <PanelSection
          className="speaker-management-panel-card transcription-side-pane-speaker-panel-section transcription-side-pane-speaker-groups"
          title={messages.speakerGroupAria}
          aria-label={messages.speakerGroupAria}
        >
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
                      onClick={() => { speakerCtx.handleSelectSpeakerUnits(option.key); onClose(); }}
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
                    <div>{speakerCtx.speakerReferenceStatsReady ? messages.speakerAxisStats(option.transcriptionUnitCount, option.segmentCount) : messages.speakerAxisStatsPending}</div>
                    {option.isUnused && <div>{messages.speakerUnusedEntityHint}</div>}
                    {duplicateCount > 1 && <div>{messages.speakerDuplicateEntityHint(duplicateCount)}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </PanelSection>
      )}
    </SidePaneActionModal>
  );
}
