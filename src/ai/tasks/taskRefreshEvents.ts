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