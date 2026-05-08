/**
 * Thin re-export facade: agentLoopRunner logic has been sunk to src/ai/chat/agentLoopRunner.ts.
 * Keep this file so existing imports continue to work.
 */

export {
  runAgentLoop,
  type AgentLoopRunnerResult,
} from '../ai/chat/agentLoopRunner';
