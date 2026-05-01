export const AI_TASKS_UPDATED_EVENT = 'jieyu:ai-tasks-updated';

export function notifyAiTasksUpdated(): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AI_TASKS_UPDATED_EVENT));
}

// 打开审批中心事件 | Open approval center event (dispatched from embedding task list, consumed by chat window)
export const OPEN_APPROVAL_CENTER_EVENT = 'jieyu:open-approval-center';

export function notifyOpenApprovalCenter(): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_APPROVAL_CENTER_EVENT));
}

export const REQUEST_AGENT_LOOP_RESUME_EVENT = 'jieyu:request-agent-loop-resume';

export type RequestAgentLoopResumeDetail = {
  taskId?: string;
};

export const REQUEST_EMBEDDING_TASK_FOCUS_EVENT = 'jieyu:request-embedding-task-focus';
export const EMBEDDING_TASK_FOCUS_TASK_ID_STORAGE_KEY = 'jieyu.ai.embeddingTaskFocusTaskId';

export type RequestEmbeddingTaskFocusDetail = {
  taskId?: string;
};

function persistRequestedEmbeddingTaskFocusTaskId(taskId: string | undefined): void {
  if (typeof window === 'undefined') return;
  const normalized = taskId?.trim() ?? '';
  if (!normalized) return;
  window.sessionStorage.setItem(EMBEDDING_TASK_FOCUS_TASK_ID_STORAGE_KEY, normalized);
}

export function consumeRequestedEmbeddingTaskFocusTaskIdFromSessionStorage(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(EMBEDDING_TASK_FOCUS_TASK_ID_STORAGE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(EMBEDDING_TASK_FOCUS_TASK_ID_STORAGE_KEY);
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

export function notifyRequestAgentLoopResume(detail?: RequestAgentLoopResumeDetail): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RequestAgentLoopResumeDetail>(REQUEST_AGENT_LOOP_RESUME_EVENT, {
    ...(detail ? { detail } : {}),
  }));
}

export function notifyRequestEmbeddingTaskFocus(detail?: RequestEmbeddingTaskFocusDetail): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  persistRequestedEmbeddingTaskFocusTaskId(detail?.taskId);
  window.dispatchEvent(new CustomEvent<RequestEmbeddingTaskFocusDetail>(REQUEST_EMBEDDING_TASK_FOCUS_EVENT, {
    ...(detail ? { detail } : {}),
  }));
}