// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { addLogObserver, setLogLevel, type LogEntry } from '../observability/logger';
import {
  SpeakerRailProvider,
  type SpeakerRailContextValue,
  resetSpeakerRailContextDiagnosticsForTests,
  useSpeakerRailContext,
} from './SpeakerRailContext';

let capturedContext: SpeakerRailContextValue | null = null;

function MissingProviderProbe() {
  capturedContext = useSpeakerRailContext();
  return null;
}

function ProviderProbe() {
  const speakerCtx = useSpeakerRailContext();

  return <div>{speakerCtx.selectedSpeakerSummary}</div>;
}

describe('SpeakerRailContext', () => {
  beforeEach(() => {
    setLogLevel('debug');
    resetSpeakerRailContextDiagnosticsForTests();
    capturedContext = null;
  });

  afterEach(() => {
    resetSpeakerRailContextDiagnosticsForTests();
    capturedContext = null;
  });

  it('logs missing provider once and throws explicit error when action is invoked', () => {
    const entries: LogEntry[] = [];
    const unsubscribe = addLogObserver((entry) => entries.push(entry));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<MissingProviderProbe />);

      expect(entries).toHaveLength(1);
      expect(entries[0]!.module).toBe('SpeakerRailContext');
      expect(entries[0]!.message).toContain('SpeakerRailProvider is missing');

      expect(capturedContext).toBeTruthy();
      expect(() => capturedContext!.handleRenameSpeaker('spk-1')).toThrow(
        /attempt: handleRenameSpeaker/,
      );

      expect(entries).toHaveLength(1);
    } finally {
      consoleErrorSpy.mockRestore();
      unsubscribe();
    }
  });

  it('returns provider value when SpeakerRailProvider is present', () => {
    const speakerManagement = {
      speakerOptions: [],
      speakerDraftName: '',
      setSpeakerDraftName: () => undefined,
      batchSpeakerId: '',
      setBatchSpeakerId: () => undefined,
      speakerSaving: false,
      activeSpeakerFilterKey: 'all',
      setActiveSpeakerFilterKey: () => undefined,
      speakerDialogState: null,
      speakerVisualByUtteranceId: {},
      speakerFilterOptions: [],
      speakerReferenceStats: {},
      speakerReferenceStatsReady: true,
      selectedSpeakerSummary: 'Alice',
      selectedUnitIds: new Set<string>(),
      handleSelectSpeakerUtterances: () => undefined,
      handleClearSpeakerAssignments: () => undefined,
      handleExportSpeakerSegments: () => undefined,
      handleRenameSpeaker: () => undefined,
      handleMergeSpeaker: () => undefined,
      handleDeleteSpeaker: () => undefined,
      handleDeleteUnusedSpeakers: async () => undefined,
      handleAssignSpeakerToSelected: async () => undefined,
      handleClearSpeakerOnSelectedRouted: async () => undefined,
      handleCreateSpeakerAndAssign: async () => undefined,
      handleCreateSpeakerOnly: async () => undefined,
      closeSpeakerDialog: () => undefined,
      updateSpeakerDialogDraftName: () => undefined,
      updateSpeakerDialogTargetKey: () => undefined,
      confirmSpeakerDialog: async () => undefined,
    };

    const { getByText } = render(
      <SpeakerRailProvider
        speakerManagement={speakerManagement}
        selectedUnitIds={new Set<string>()}
        handleAssignSpeakerToSelectedRouted={async () => undefined}
        handleClearSpeakerOnSelectedRouted={async () => undefined}
      >
        <ProviderProbe />
      </SpeakerRailProvider>,
    );

    expect(getByText('Alice')).toBeTruthy();
  });
});
