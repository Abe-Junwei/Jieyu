/**
 * Contract: `resolveVoiceIntent` 在「Service 风格静态依赖」与「Hook 风格懒加载依赖」下输出一致，
 * 防止 VoiceAgentService.commandBridge 与 useVoiceAgentResultHandler 漂移（Phase A2）。
 */
import { describe, expect, it } from 'vitest';
import type { SttResult } from '../../services/VoiceInputService';
import type { ActionId, VoiceSession } from '../../services/IntentRouter';
import { routeIntent, learnVoiceIntentAlias, bumpAliasUsage } from '../../services/IntentRouter';
import { refineLlmFallbackIntent } from '../../services/voiceIntentRefine';
import { resolveVoiceIntent } from '../../services/voiceIntentResolution';
import { loadIntentRouterRuntime, loadVoiceIntentRefineRuntime } from './useVoiceAgent.runtime';

function baseSession(mode: VoiceSession['mode']): VoiceSession {
  return {
    id: 'parity-session',
    startedAt: 1_700_000_000_000,
    entries: [],
    mode,
  };
}

function sttFinal(text: string): SttResult {
  return {
    text,
    lang: 'zh-CN',
    isFinal: true,
    confidence: 0.92,
    engine: 'web-speech',
  };
}

describe('resolveVoiceIntent service vs hook-style deps parity', () => {
  it('matches for command-mode rule hit (playPause)', async () => {
    const input = {
      result: sttFinal('播放'),
      mode: 'command' as const,
      session: baseSession('command'),
      aliasMap: {} as Record<string, ActionId>,
      locale: 'zh-CN' as const,
    };

    const staticDeps = {
      routeIntent,
      learnVoiceIntentAlias,
      bumpAliasUsage,
      refineLlmFallbackIntent,
    };
    const staticOut = await resolveVoiceIntent(staticDeps, input);

    const ir = await loadIntentRouterRuntime();
    const refineRt = await loadVoiceIntentRefineRuntime();
    const lazyOut = await resolveVoiceIntent(
      {
        routeIntent: ir.routeIntent,
        learnVoiceIntentAlias: ir.learnVoiceIntentAlias,
        bumpAliasUsage: ir.bumpAliasUsage,
        refineLlmFallbackIntent: refineRt.refineLlmFallbackIntent,
      },
      input,
    );

    expect(lazyOut).toEqual(staticOut);
    expect(staticOut.intent.type).toBe('action');
    if (staticOut.intent.type === 'action') {
      expect(staticOut.intent.actionId).toBe('playPause');
    }
  });

  it('matches for dictation mode (no LLM branch)', async () => {
    const input = {
      result: sttFinal('你好世界'),
      mode: 'dictation' as const,
      session: baseSession('dictation'),
      aliasMap: {},
      locale: 'zh-CN' as const,
    };

    const staticOut = await resolveVoiceIntent(
      {
        routeIntent,
        learnVoiceIntentAlias,
        bumpAliasUsage,
        refineLlmFallbackIntent,
      },
      input,
    );

    const ir = await loadIntentRouterRuntime();
    const refineRt = await loadVoiceIntentRefineRuntime();
    const lazyOut = await resolveVoiceIntent(
      {
        routeIntent: ir.routeIntent,
        learnVoiceIntentAlias: ir.learnVoiceIntentAlias,
        bumpAliasUsage: ir.bumpAliasUsage,
        refineLlmFallbackIntent: refineRt.refineLlmFallbackIntent,
      },
      input,
    );

    expect(lazyOut).toEqual(staticOut);
  });
});
