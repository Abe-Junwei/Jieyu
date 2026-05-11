/**
 * Agent-loop resume: sessionStorage bridge + user text heuristics (pure, no React).
 */

const AGENT_LOOP_RESUME_TASK_ID_STORAGE_KEY = 'jieyu.aiChat.resumeAgentLoopTaskId';

export function isAgentLoopResumeText(userText: string): boolean {
  const normalized = userText.trim();
  if (!normalized) return false;
  return (
    /^(继续|继续执行|接着|接着说|继续吧)$/u.test(normalized) ||
    /^(continue|resume|go on)$/i.test(normalized)
  );
}

export function consumeRequestedAgentLoopTaskIdFromSessionStorage(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(AGENT_LOOP_RESUME_TASK_ID_STORAGE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(AGENT_LOOP_RESUME_TASK_ID_STORAGE_KEY);
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}
