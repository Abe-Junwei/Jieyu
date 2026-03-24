// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    render(<MissingProviderProbe />);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.module).toBe('SpeakerRailContext');
    expect(entries[0]!.message).toContain('SpeakerRailProvider is missing');

    expect(capturedContext).toBeTruthy();
    expect(() => capturedContext!.handleRenameSpeaker('spk-1')).toThrow(
      /Attempted action: handleRenameSpeaker/,
    );

    expect(entries).toHaveLength(1);
    unsubscribe();
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
      selectedSpeakerSummary: 'Alice',
      selectedUtteranceIds: new Set<string>(),
      handleSelectSpeakerUtterances: () => undefined,
      handleClearSpeakerAssignments: () => undefined,
      handleExportSpeakerSegments: () => undefined,
      handleRenameSpeaker: () => undefined,
      handleMergeSpeaker: () => undefined,
      handleDeleteSpeaker: () => undefined,
      handleAssignSpeakerToSelected: async () => undefined,
      handleCreateSpeakerAndAssign: async () => undefined,
      handleCreateSpeakerOnly: async () => undefined,
      closeSpeakerDialog: () => undefined,
      updateSpeakerDialogDraftName: () => undefined,
      updateSpeakerDialogTargetKey: () => undefined,
      confirmSpeakerDialog: async () => undefined,
    };

    const { getByText } = render(
      <SpeakerRailProvider speakerManagement={speakerManagement}>
        <ProviderProbe />
      </SpeakerRailProvider>,
    );

    expect(getByText('Alice')).toBeTruthy();
  });
});