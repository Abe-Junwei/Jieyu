import { describe, expect, it } from 'vitest';
import {
  AgentCallbackRegistry,
  getDefaultAgentCallbackRegistry,
  runWithToolCallbacks,
} from './agentCallbacks';

describe('AgentCallbackRegistry', () => {
  it('runs handlers in registration order for a phase', async () => {
    const registry = new AgentCallbackRegistry();
    const seen: string[] = [];
    registry.register('before_tool', () => {
      seen.push('a');
    });
    registry.register('before_tool', () => {
      seen.push('b');
    });
    registry.register('after_tool', () => {
      seen.push('c');
    });
    await registry.run('before_tool', { toolName: 'search_units' });
    expect(seen).toEqual(['a', 'b']);
    await registry.run('after_tool', { toolName: 'search_units', resultOk: true });
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('unregister stops a handler from running', async () => {
    const registry = new AgentCallbackRegistry();
    const seen: string[] = [];
    const unregister = registry.register('before_model', () => {
      seen.push('x');
    });
    unregister();
    await registry.run('before_model');
    expect(seen).toEqual([]);
  });

  it('runWithToolCallbacks emits before_tool then after_tool around execute', async () => {
    const registry = getDefaultAgentCallbackRegistry();
    const seen: string[] = [];
    const unregisterBefore = registry.register('before_tool', (ctx) => {
      seen.push(`before:${ctx.toolName}`);
    });
    const unregisterAfter = registry.register('after_tool', (ctx) => {
      seen.push(`after:${ctx.resultOk}`);
    });
    const result = await runWithToolCallbacks('search_units', async () => ({ ok: true }), {
      resultOk: (item) => item.ok,
    });
    unregisterBefore();
    unregisterAfter();
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual(['before:search_units', 'after:true']);
  });
});
