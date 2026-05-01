import { describe, expect, it, beforeEach } from 'vitest';
import {
  getAssistantDialogueSnapshot,
  publishAssistantDialogueChatToolLayer,
  publishAssistantDialogueVoiceLayer,
  resetAssistantDialogueStateForTests,
} from './assistantDialogueState';
import type { ActionIntent } from './IntentRouter';
import type { PendingAiToolCall } from '../hooks/useAiChat.types';

function makeActionIntent(actionId: ActionIntent['actionId'], confidence = 0.9): ActionIntent {
  return {
    type: 'action',
    actionId,
    raw: 'x',
    confidence,
  };
}

function makeMinimalPendingToolCall(): PendingAiToolCall {
  return {
    call: { name: 'delete_layer', arguments: {}, requestId: 'r1' },
    assistantMessageId: 'm-test',
  };
}

describe('assistantDialogueState', () => {
  beforeEach(() => {
    resetAssistantDialogueStateForTests();
  });

  it('prefers chat tool over voice prompts', () => {
    publishAssistantDialogueVoiceLayer({
      pendingConfirm: { actionId: 'playPause', label: 'Play' },
      disambiguationOptions: [makeActionIntent('undo')],
    });
    publishAssistantDialogueChatToolLayer(makeMinimalPendingToolCall());

    const s = getAssistantDialogueSnapshot();
    expect(s.primary).toBe('chat_tool');
    expect(s.chatTool).not.toBeNull();
    expect(s.voicePendingConfirm?.actionId).toBe('playPause');
    expect(s.voiceDisambiguationOptions.length).toBe(1);
  });

  it('uses voice disambiguation before voice confirm', () => {
    publishAssistantDialogueVoiceLayer({
      pendingConfirm: { actionId: 'playPause', label: 'Play' },
      disambiguationOptions: [makeActionIntent('mergeNext')],
    });

    const s = getAssistantDialogueSnapshot();
    expect(s.primary).toBe('voice_disambiguation');
  });

  it('falls back to voice confirm when no disambiguation', () => {
    publishAssistantDialogueVoiceLayer({
      pendingConfirm: { actionId: 'playPause', label: 'Play' },
      disambiguationOptions: [],
    });

    expect(getAssistantDialogueSnapshot().primary).toBe('voice_confirm');
  });

  it('is idle when layers cleared', () => {
    publishAssistantDialogueVoiceLayer({ pendingConfirm: { actionId: 'playPause', label: 'Play' }, disambiguationOptions: [] });
    publishAssistantDialogueVoiceLayer({ pendingConfirm: null, disambiguationOptions: [] });

    expect(getAssistantDialogueSnapshot().primary).toBe('none');
  });
});
