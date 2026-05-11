import { describe, expect, it, beforeEach } from 'vitest';
import {
  getAssistantDialogueSnapshot,
  isAssistantChatComposerBlocked,
  isVoiceDialogueBlockingPrimary,
  publishAssistantDialogueChatToolLayer,
  publishAssistantDialogueVoiceLayer,
  resetAssistantDialogueStateForTests,
} from './assistantDialogueState';
import type { ActionIntent } from './IntentRouter';
import type { PendingAiToolCall } from '../hooks/ai/useAiChat.types';

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
    publishAssistantDialogueVoiceLayer({
      pendingConfirm: { actionId: 'playPause', label: 'Play' },
      disambiguationOptions: [],
    });
    publishAssistantDialogueVoiceLayer({ pendingConfirm: null, disambiguationOptions: [] });

    expect(getAssistantDialogueSnapshot().primary).toBe('none');
  });
});

describe('ADR-0028 same-session assistant dialogue + chat composer gate', () => {
  beforeEach(() => {
    resetAssistantDialogueStateForTests();
  });

  it('marks voice confirm / disambiguation primaries as voice-blocking', () => {
    expect(isVoiceDialogueBlockingPrimary('voice_confirm')).toBe(true);
    expect(isVoiceDialogueBlockingPrimary('voice_disambiguation')).toBe(true);
    expect(isVoiceDialogueBlockingPrimary('none')).toBe(false);
    expect(isVoiceDialogueBlockingPrimary('chat_tool')).toBe(false);
  });

  it('blocks chat composer when voice confirm is primary (typed send path)', () => {
    publishAssistantDialogueVoiceLayer({
      pendingConfirm: { actionId: 'playPause', label: 'Play' },
      disambiguationOptions: [],
    });
    const snap = getAssistantDialogueSnapshot();
    expect(snap.primary).toBe('voice_confirm');
    expect(
      isAssistantChatComposerBlocked({ hasToolPending: false, dialoguePrimary: snap.primary }),
    ).toBe(true);
  });

  it('blocks chat composer when voice disambiguation is primary', () => {
    publishAssistantDialogueVoiceLayer({
      pendingConfirm: { actionId: 'playPause', label: 'Play' },
      disambiguationOptions: [makeActionIntent('mergeNext')],
    });
    const snap = getAssistantDialogueSnapshot();
    expect(snap.primary).toBe('voice_disambiguation');
    expect(
      isAssistantChatComposerBlocked({ hasToolPending: false, dialoguePrimary: snap.primary }),
    ).toBe(true);
  });

  it('when chat tool wins snapshot primary, composer is blocked only via tool flag (voice data may linger)', () => {
    publishAssistantDialogueVoiceLayer({
      pendingConfirm: { actionId: 'playPause', label: 'Play' },
      disambiguationOptions: [],
    });
    publishAssistantDialogueChatToolLayer(makeMinimalPendingToolCall());
    const snap = getAssistantDialogueSnapshot();
    expect(snap.primary).toBe('chat_tool');
    expect(isVoiceDialogueBlockingPrimary(snap.primary)).toBe(false);
    expect(
      isAssistantChatComposerBlocked({ hasToolPending: true, dialoguePrimary: snap.primary }),
    ).toBe(true);
    expect(
      isAssistantChatComposerBlocked({ hasToolPending: false, dialoguePrimary: snap.primary }),
    ).toBe(false);
  });
});
