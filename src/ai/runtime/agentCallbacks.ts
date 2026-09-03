/**
 * A10.1 — ADK-shaped callback registry (borrow design, no ADK dependency).
 * A9 semantic guard registers before_model / before_client; inspect still runs in the pipeline
 * because handlers cannot return rewritten outbound text.
 */

export type AgentCallbackPhase =
  | 'before_turn'
  | 'before_model'
  | 'after_model'
  | 'before_tool'
  | 'after_tool'
  | 'before_client';

export type AgentCallbackContext = {
  phase: AgentCallbackPhase;
  toolName?: string;
  workflowId?: string;
  agentRunId?: string;
  resultOk?: boolean;
  text?: string;
  snippets?: readonly string[];
  trustTier?: 'user' | 'workspace' | 'untrusted';
};

export type AgentCallbackHandler = (ctx: AgentCallbackContext) => void | Promise<void>;

export class AgentCallbackRegistry {
  private readonly handlers = new Map<AgentCallbackPhase, AgentCallbackHandler[]>();

  register(phase: AgentCallbackPhase, handler: AgentCallbackHandler): () => void {
    const list = this.handlers.get(phase) ?? [];
    list.push(handler);
    this.handlers.set(phase, list);
    return () => {
      const current = this.handlers.get(phase);
      if (!current) return;
      this.handlers.set(
        phase,
        current.filter((item) => item !== handler),
      );
    };
  }

  async run(
    phase: AgentCallbackPhase,
    ctx: Omit<AgentCallbackContext, 'phase'> = {},
  ): Promise<void> {
    const list = this.handlers.get(phase) ?? [];
    for (const handler of list) {
      await handler({ ...ctx, phase });
    }
  }
}

const defaultRegistry = new AgentCallbackRegistry();

export function getDefaultAgentCallbackRegistry(): AgentCallbackRegistry {
  return defaultRegistry;
}

export async function runWithToolCallbacks<T>(
  toolName: string,
  execute: () => Promise<T>,
  options?: {
    agentRunId?: string;
    resultOk?: (result: T) => boolean;
  },
): Promise<T> {
  const registry = getDefaultAgentCallbackRegistry();
  await registry.run('before_tool', {
    toolName,
    ...(options?.agentRunId ? { agentRunId: options.agentRunId } : {}),
  });
  const result = await execute();
  await registry.run('after_tool', {
    toolName,
    resultOk: options?.resultOk ? options.resultOk(result) : true,
    ...(options?.agentRunId ? { agentRunId: options.agentRunId } : {}),
  });
  return result;
}
