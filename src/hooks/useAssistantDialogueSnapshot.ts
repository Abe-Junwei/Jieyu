import { useSyncExternalStore } from 'react';
import { getAssistantDialogueSnapshot, subscribeAssistantDialogue } from '../services/assistantDialogueState';

export function useAssistantDialogueSnapshot() {
  return useSyncExternalStore(subscribeAssistantDialogue, getAssistantDialogueSnapshot, getAssistantDialogueSnapshot);
}
