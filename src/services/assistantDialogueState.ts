/**
 * Shared assistant dialogue snapshot for ADR-0028: one read model for voice confirm/disambiguation
 * and chat pending tool calls (writer paths stay in hooks; this module merges priority for UI).
 */

import type { ActionIntent, ActionId } from './IntentRouter';
import type { PendingAiToolCall } from '../hooks/useAiChat.types';

/** Mirrors `VoicePendingConfirm` without importing `useVoiceAgent` (avoid circular deps). */
export interface AssistantVoicePendingConfirm {
  actionId: ActionId;
  label: string;
  fromFuzzy?: boolean;
  params?: { segmentIndex?: number };
}

export type AssistantDialoguePrimary =
  | 'none'
  | 'chat_tool'
  | 'voice_disambiguation'
  | 'voice_confirm';

/**
 * ADR-0028: voice confirm / disambiguation is the shared-dialogue layer that must
 * block typed chat sends in the same session (mirrors `AiChatCard` composer gating).
 */
export function isVoiceDialogueBlockingPrimary(primary: AssistantDialoguePrimary): boolean {
  return primary === 'voice_disambiguation' || primary === 'voice_confirm';
}

/**
 * ADR-0028: high-risk pending tool or active voice dialogue blocks the chat composer.
 * When `primary === 'chat_tool'`, voice-side fields may still be present in the snapshot
 * but do not participate in this gate (UI read model prefers the tool layer).
 */
export function isAssistantChatComposerBlocked(input: {
  hasToolPending: boolean;
  dialoguePrimary: AssistantDialoguePrimary;
}): boolean {
  return input.hasToolPending || isVoiceDialogueBlockingPrimary(input.dialoguePrimary);
}

export interface AssistantDialogueSnapshot {
  primary: AssistantDialoguePrimary;
  chatTool: PendingAiToolCall | null;
  voicePendingConfirm: AssistantVoicePendingConfirm | null;
  voiceDisambiguationOptions: ActionIntent[];
}

let chatTool: PendingAiToolCall | null = null;
let voicePendingConfirm: AssistantVoicePendingConfirm | null = null;
let voiceDisambiguationOptions: ActionIntent[] = [];
const listeners = new Set<() => void>();
let cachedSnapshot: AssistantDialogueSnapshot = {
  primary: 'none',
  chatTool: null,
  voicePendingConfirm: null,
  voiceDisambiguationOptions: [],
};

function derive(): AssistantDialogueSnapshot {
  if (chatTool) {
    return {
      primary: 'chat_tool',
      chatTool,
      voicePendingConfirm,
      voiceDisambiguationOptions: [...voiceDisambiguationOptions],
    };
  }
  if (voiceDisambiguationOptions.length > 0) {
    return {
      primary: 'voice_disambiguation',
      chatTool: null,
      voicePendingConfirm,
      voiceDisambiguationOptions: [...voiceDisambiguationOptions],
    };
  }
  if (voicePendingConfirm) {
    return {
      primary: 'voice_confirm',
      chatTool: null,
      voicePendingConfirm,
      voiceDisambiguationOptions: [],
    };
  }
  return {
    primary: 'none',
    chatTool: null,
    voicePendingConfirm: null,
    voiceDisambiguationOptions: [],
  };
}

function emit(): void {
  cachedSnapshot = derive();
  listeners.forEach((l) => l());
}

export function publishAssistantDialogueVoiceLayer(next: {
  pendingConfirm: AssistantVoicePendingConfirm | null;
  disambiguationOptions: ActionIntent[];
}): void {
  voicePendingConfirm = next.pendingConfirm;
  voiceDisambiguationOptions = next.disambiguationOptions;
  emit();
}

export function publishAssistantDialogueChatToolLayer(next: PendingAiToolCall | null): void {
  chatTool = next;
  emit();
}

export function getAssistantDialogueSnapshot(): AssistantDialogueSnapshot {
  return cachedSnapshot;
}

export function subscribeAssistantDialogue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper | 单测用 */
export function resetAssistantDialogueStateForTests(): void {
  chatTool = null;
  voicePendingConfirm = null;
  voiceDisambiguationOptions = [];
  emit();
}
