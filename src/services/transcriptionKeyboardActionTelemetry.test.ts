import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordTranscriptionKeyboardAction, TRANSCRIPTION_TEXT_INPUT_BEHAVIOR_SESSION_ID } from './transcriptionKeyboardActionTelemetry';

const mockRecordAction = vi.fn();

vi.mock('./UserBehaviorStore', () => ({
  userBehaviorStore: {
    recordAction: (...args: unknown[]) => mockRecordAction(...args),
  },
}));

describe('recordTranscriptionKeyboardAction', () => {
  afterEach(() => {
    mockRecordAction.mockClear();
  });

  it('records known ActionId with text modality', () => {
    recordTranscriptionKeyboardAction('search');
    expect(mockRecordAction).toHaveBeenCalledWith({
      actionId: 'search',
      durationMs: 0,
      sessionId: TRANSCRIPTION_TEXT_INPUT_BEHAVIOR_SESSION_ID,
      inputModality: 'text',
    });
  });

  it('ignores ids that are not registered ActionId', () => {
    recordTranscriptionKeyboardAction('notARegisteredActionId');
    expect(mockRecordAction).not.toHaveBeenCalled();
  });

  it('records review navigation ids from waveform shortcuts', () => {
    recordTranscriptionKeyboardAction('reviewNext');
    expect(mockRecordAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'reviewNext', inputModality: 'text' }),
    );
  });

  it('records toolbar-only ActionId values', () => {
    recordTranscriptionKeyboardAction('toolbarRefresh');
    expect(mockRecordAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'toolbarRefresh', inputModality: 'text' }),
    );
  });

  it('records timeline chrome ActionId values', () => {
    recordTranscriptionKeyboardAction('timelineSeek');
    expect(mockRecordAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'timelineSeek', inputModality: 'text' }),
    );
  });

  it('records workspace remainder ActionId values', () => {
    recordTranscriptionKeyboardAction('workspaceBatchOpsClose');
    expect(mockRecordAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'workspaceBatchOpsClose', inputModality: 'text' }),
    );
  });
});
