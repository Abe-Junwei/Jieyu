import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  cancelAgentLoopCheckpointTask,
  loadLatestPendingAgentLoopCheckpoint,
  loadPendingAgentLoopCheckpointFromTaskId,
  resolveAgentLoopCheckpointConversationId,
} from '../../ai/chat/agentLoopCheckpoint';
import { persistSessionMemory } from '../../ai/chat/sessionMemory';
import { notifyAiTasksUpdated } from '../../ai/tasks/taskRefreshEvents';
import {
  consumeRequestedAgentLoopTaskIdFromSessionStorage,
  isAgentLoopResumeText,
} from './useAiChat.agentLoopResumeSession';
import type {
  AiSessionMemory,
  AiSessionMemoryPendingAgentLoopCheckpoint,
  UiChatMessage,
} from './useAiChat.types';

export function useAiChatAgentLoopCheckpointControls(options: {
  sessionMemoryRef: MutableRefObject<AiSessionMemory>;
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>;
  conversationIdRef: MutableRefObject<string | null>;
}) {
  const { sessionMemoryRef, setMessages, conversationIdRef } = options;

  const clearPendingAgentLoopCheckpoint = useCallback(() => {
    if (!sessionMemoryRef.current.pendingAgentLoopCheckpoint) return;
    const { pendingAgentLoopCheckpoint: _ignoredCheckpoint, ...restMemory } =
      sessionMemoryRef.current;
    sessionMemoryRef.current = restMemory;
    persistSessionMemory(sessionMemoryRef.current);
  }, [sessionMemoryRef]);

  const dismissPendingAgentLoopCheckpoint = useCallback(async () => {
    const checkpoint = sessionMemoryRef.current.pendingAgentLoopCheckpoint;
    if (!checkpoint) return;
    clearPendingAgentLoopCheckpoint();
    if (checkpoint.taskId) {
      await cancelAgentLoopCheckpointTask(checkpoint.taskId);
      notifyAiTasksUpdated();
    }
  }, [clearPendingAgentLoopCheckpoint, sessionMemoryRef]);

  const clearPendingAgentLoopCheckpointIfTaskIdMatches = useCallback(
    (taskId: string) => {
      const normalized = taskId.trim();
      if (!normalized) return;
      const pending = sessionMemoryRef.current.pendingAgentLoopCheckpoint;
      if (!pending || pending.taskId?.trim() !== normalized) return;
      const { pendingAgentLoopCheckpoint: _ignoredCheckpoint, ...restMemory } =
        sessionMemoryRef.current;
      sessionMemoryRef.current = restMemory;
      persistSessionMemory(sessionMemoryRef.current);
      setMessages((prev) => [...prev]);
    },
    [sessionMemoryRef, setMessages],
  );

  const resolveAgentLoopResumeCheckpoint = useCallback(
    async (userText: string) => {
      if (!isAgentLoopResumeText(userText)) return null;
      const conversationAtStart = conversationIdRef.current?.trim();

      const applyCheckpointIfStillActive = async (
        durableCheckpoint: AiSessionMemoryPendingAgentLoopCheckpoint,
      ): Promise<AiSessionMemoryPendingAgentLoopCheckpoint | null> => {
        if (conversationIdRef.current?.trim() !== conversationAtStart) return null;
        if (conversationAtStart) {
          const checkpointConversationId =
            await resolveAgentLoopCheckpointConversationId(durableCheckpoint);
          if (checkpointConversationId && checkpointConversationId !== conversationAtStart) {
            return null;
          }
        }
        const nextMemory: AiSessionMemory = {
          ...sessionMemoryRef.current,
          pendingAgentLoopCheckpoint: durableCheckpoint,
        };
        sessionMemoryRef.current = nextMemory;
        persistSessionMemory(nextMemory);
        return durableCheckpoint;
      };

      const checkpoint = sessionMemoryRef.current.pendingAgentLoopCheckpoint ?? null;
      if (checkpoint?.taskId) {
        const durableCheckpoint = await loadPendingAgentLoopCheckpointFromTaskId(checkpoint.taskId);
        if (!durableCheckpoint) return checkpoint;
        return (await applyCheckpointIfStillActive(durableCheckpoint)) ?? checkpoint;
      }
      if (checkpoint) return checkpoint;

      const requestedTaskId = consumeRequestedAgentLoopTaskIdFromSessionStorage();
      const durableCheckpoint = requestedTaskId
        ? await loadPendingAgentLoopCheckpointFromTaskId(requestedTaskId)
        : await loadLatestPendingAgentLoopCheckpoint(
            conversationAtStart ? { conversationId: conversationAtStart } : undefined,
          );
      if (!durableCheckpoint) return null;

      return applyCheckpointIfStillActive(durableCheckpoint);
    },
    [conversationIdRef, sessionMemoryRef],
  );

  return {
    clearPendingAgentLoopCheckpoint,
    dismissPendingAgentLoopCheckpoint,
    clearPendingAgentLoopCheckpointIfTaskIdMatches,
    resolveAgentLoopResumeCheckpoint,
  };
}
