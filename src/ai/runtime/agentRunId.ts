export function newAgentRunId(now = Date.now()): string {
  return `run_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
