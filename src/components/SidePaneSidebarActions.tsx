import type { SpeakerRailContextValue } from '../contexts/SpeakerRailContext';
import type { LayerDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/messages';
import { fireAndForget } from '../utils/fireAndForget';
import { WrenchIcon } from './SvgIcons';
import { formatSidePaneLayerLabel } from '../utils/transcriptionFormatters';
import { ActionButtonGroup } from './ui';
import { SidePaneActionModal } from './SidePaneActionModal';
import { SidePaneSidebarSpeakerManagement } from './SidePaneSidebarSpeakerManagement';

type ConstraintRepairDetailGroup = {
  layerId: string;
  label: string;
  repairs: Array<{ layerId: string; code: string; message: string }>;
  issues: Array<{ layerId: string; code: string; message: string }>;
  orderRepairs: Array<{ layerId: string; code: string; message: string }>;
  orderIssues: Array<{ layerId: string; code: string; message: string }>;
};

interface SidePaneSidebarActionsProps {
  hasSidePaneHost: boolean;
  messages: SidePaneSidebarMessages;
  layerActionRootRef: React.RefObject<HTMLElement | null>;
  constraintRepairBusy: boolean;
  sidePaneRowsLength: number;
  layerActionPanel: 'speaker-management' | 'create-transcription' | 'create-translation' | 'delete' | null;
  quickDeleteLayerId: string;
  quickDeleteKeepUnits: boolean;
  deletableLayers: LayerDocType[];
  layerCreateMessage: string;
  constraintRepairMessage: string;
  constraintRepairDetails: {
    repairs: Array<{ layerId: string; code: string; message: string }>;
    issues: Array<{ layerId: string; code: string; message: string }>;
    orderRepairs: Array<{ layerId: string; code: string; message: string }>;
    orderIssues: Array<{ layerId: string; code: string; message: string }>;
  } | null;
  constraintRepairDetailsCollapsed: boolean;
  groupedConstraintRepairDetails: ConstraintRepairDetailGroup[];
  speakerCtx: SpeakerRailContextValue;
  onRunRepair: () => Promise<void>;
  setLayerActionPanel: (value: 'speaker-management' | 'create-transcription' | 'create-translation' | 'delete' | null) => void;
  setQuickDeleteLayerId: (value: string) => void;
  setQuickDeleteKeepUnits: (value: boolean) => void;
  requestDeleteLayer: (layerId: string) => Promise<void>;
  setConstraintRepairDetailsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

export function SidePaneSidebarActions({
  hasSidePaneHost,
  messages,
  layerActionRootRef,
  constraintRepairBusy,
  sidePaneRowsLength,
  layerActionPanel,
  quickDeleteLayerId,
  quickDeleteKeepUnits,
  deletableLayers,
  layerCreateMessage,
  constraintRepairMessage,
  constraintRepairDetails,
  constraintRepairDetailsCollapsed,
  groupedConstraintRepairDetails,
  speakerCtx,
  onRunRepair,
  setLayerActionPanel,
  setQuickDeleteLayerId,
  setQuickDeleteKeepUnits,
  requestDeleteLayer,
  setConstraintRepairDetailsCollapsed,
}: SidePaneSidebarActionsProps) {
  return (
    <div
      className={`transcription-side-pane-actions ${hasSidePaneHost ? 'transcription-side-pane-actions-portaled' : ''}`}
      aria-label={messages.quickActionsAria}
      ref={layerActionRootRef as React.RefObject<HTMLDivElement>}
      data-layer-pane-interactive="true"
    >
      <button
        type="button"
        className="transcription-side-pane-quick-action"
        disabled={constraintRepairBusy || sidePaneRowsLength === 0}
        onClick={() => {
          fireAndForget(onRunRepair(), { context: 'src/components/SidePaneSidebarActions.tsx:L84', policy: 'user-visible' });
        }}
      >
        <WrenchIcon className="transcription-side-pane-quick-action-icon" />
        <span className="transcription-side-pane-quick-action-label">{constraintRepairBusy ? messages.quickActionRepairing : messages.quickActionRepair}</span>
      </button>

      {layerActionPanel === 'speaker-management' && (
        <SidePaneSidebarSpeakerManagement
          speakerCtx={speakerCtx}
          messages={messages}
          onClose={() => setLayerActionPanel(null)}
        />
      )}

      {layerActionPanel === 'delete' && (
        <SidePaneActionModal ariaLabel={messages.deleteLayerModalAria} closeLabel={messages.cancelButton} onClose={() => setLayerActionPanel(null)}>
          <select
            className="layer-action-dialog-input"
            value={quickDeleteLayerId}
            onChange={(event) => setQuickDeleteLayerId(event.target.value)}
            aria-label={messages.deleteLayerModalAria}
          >
            {deletableLayers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {formatSidePaneLayerLabel(layer)}
              </option>
            ))}
          </select>
          <label className="transcription-side-pane-inline-checkbox">
            <input
              type="checkbox"
              checked={quickDeleteKeepUnits}
              onChange={(event) => setQuickDeleteKeepUnits(event.target.checked)}
            />
            {messages.deleteKeepUnits}
          </label>
          <ActionButtonGroup className="layer-action-dialog-actions">
            <button
              className="layer-action-dialog-btn layer-action-dialog-btn-danger"
              disabled={!quickDeleteLayerId}
              onClick={() => {
                fireAndForget((async () => {
                  await requestDeleteLayer(quickDeleteLayerId);
                  setLayerActionPanel(null);
                })(), { context: 'src/components/SidePaneSidebarActions.tsx:L126', policy: 'user-visible' });
              }}
            >
              {messages.deleteButton}
            </button>
            <button className="layer-action-dialog-btn layer-action-dialog-btn-ghost" onClick={() => setLayerActionPanel(null)}>{messages.cancelButton}</button>
          </ActionButtonGroup>
        </SidePaneActionModal>
      )}

      {layerCreateMessage && (
        <p className="small-text transcription-side-pane-message">
          {layerCreateMessage}
        </p>
      )}
      {constraintRepairMessage && (
        <p className="small-text transcription-side-pane-message">
          {constraintRepairMessage}
        </p>
      )}
      {constraintRepairDetails && (
        constraintRepairDetails.repairs.length > 0
        || constraintRepairDetails.issues.length > 0
        || constraintRepairDetails.orderRepairs.length > 0
        || constraintRepairDetails.orderIssues.length > 0
      ) && (
        <div
          aria-label={messages.repairDetailsAria}
          className="transcription-side-pane-repair-details"
        >
          <div className="transcription-side-pane-repair-header">
            <strong>{messages.repairDetailsTitle}</strong>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConstraintRepairDetailsCollapsed((prev) => !prev)}
              aria-label={constraintRepairDetailsCollapsed ? messages.repairDetailsExpandAria : messages.repairDetailsCollapseAria}
            >
              {constraintRepairDetailsCollapsed ? messages.repairDetailsExpand : messages.repairDetailsCollapse}
            </button>
          </div>
          {!constraintRepairDetailsCollapsed && groupedConstraintRepairDetails.map((group) => (
            <div
              key={`group-${group.layerId}`}
              className="transcription-side-pane-repair-group"
            >
              <div className="transcription-side-pane-repair-group-label">{group.label}</div>
              {group.repairs.map((item, index) => (
                <div key={`repair-${item.layerId}-${item.code}-${index}`}>
                  [repaired][{item.code}] {item.message}
                </div>
              ))}
              {group.issues.map((item, index) => (
                <div key={`issue-${item.layerId}-${item.code}-${index}`}>
                  [pending][{item.code}] {item.message}
                </div>
              ))}
              {group.orderRepairs.map((item, index) => (
                <div key={`order-repair-${item.layerId}-${item.code}-${index}`}>
                  [order-repaired][{item.code}] {item.message}
                </div>
              ))}
              {group.orderIssues.map((item, index) => (
                <div key={`order-issue-${item.layerId}-${item.code}-${index}`}>
                  [order-pending][{item.code}] {item.message}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
