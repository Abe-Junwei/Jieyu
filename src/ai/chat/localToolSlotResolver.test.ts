import { describe, expect, it } from 'vitest';
import type { AiSessionMemory } from './chatDomain.types';
import { buildLocalToolStatePatchFromCallResult, detectLocalToolClarificationNeed, resolveLocalToolCalls, resolveLocalToolRoutingPlan } from './localToolSlotResolver';

describe('localToolSlotResolver', () => {
  it('rewrites empty search query to list intent for list-like user unit', () => {
    const result = resolveLocalToolCalls(
      [{ name: 'search_units', arguments: {} }],
      '列出哪八个语段',
      {},
    );
    expect(result.calls[0]).toEqual({
      name: 'list_units',
      arguments: { limit: 8, scope: 'current_scope' },
    });
  });

  it('fills search query from user text when possible', () => {
    const result = resolveLocalToolCalls(
      [{ name: 'search_units', arguments: { limit: 5 } }],
      '搜索 包含 你好 的语段',
      {},
    );
    expect(result.calls[0]?.name).toBe('search_units');
    expect(result.calls[0]?.arguments.query).toBe('搜索 包含 你好 的语段');
    expect(result.calls[0]?.arguments.scope).toBe('current_scope');
  });

  it('fills get_unit_detail from last result set ordinal', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'unit.list',
        lastResultUnitIds: ['utt-1', 'utt-2', 'utt-3'],
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const result = resolveLocalToolCalls(
      [{ name: 'get_unit_detail', arguments: {} }],
      '看第2个',
      memory,
    );
    expect(result.calls[0]).toEqual({
      name: 'get_unit_detail',
      arguments: { unitId: 'utt-2', scope: 'current_scope' },
    });
  });

  it('records local tool state patch from successful list result', () => {
    const patch = buildLocalToolStatePatchFromCallResult(
      { name: 'list_units', arguments: { limit: 8 } },
      {
        ok: true,
        result: {
          matches: [{ id: 'utt-a' }, { id: 'utt-b' }],
        },
      },
    );
    expect(patch.lastIntent).toBe('unit.list');
    expect(patch.clearLastQuery).toBe(true);
    expect(patch.lastResultUnitIds).toEqual(['utt-a', 'utt-b']);
  });

  it('clears lastResultUnitIds on successful search with zero matches', () => {
    const patch = buildLocalToolStatePatchFromCallResult(
      { name: 'search_units', arguments: { query: 'nope', limit: 5 } },
      { ok: true, result: { query: 'nope', count: 0, matches: [] } },
    );
    expect(patch.lastIntent).toBe('unit.search');
    expect(patch.lastQuery).toBe('nope');
    expect(patch.lastResultUnitIds).toEqual([]);
  });

  it('does not treat bare digits in user text as English ordinals', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'unit.list',
        lastResultUnitIds: ['utt-1', 'utt-2'],
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const result = resolveLocalToolCalls(
      [{ name: 'get_unit_detail', arguments: {} }],
      'There are 8 segments total',
      memory,
    );
    expect(result.calls[0]?.arguments.unitId).toBeUndefined();
    expect(result.calls[0]?.arguments.scope).toBe('current_scope');
  });

  it('resolves English ordinal phrases for detail slot', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'unit.list',
        lastResultUnitIds: ['utt-1', 'utt-2'],
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const result = resolveLocalToolCalls(
      [{ name: 'get_unit_detail', arguments: {} }],
      'open the 2nd one',
      memory,
    );
    expect(result.calls[0]?.arguments.unitId).toBe('utt-2');
    expect(result.calls[0]?.arguments.scope).toBe('current_scope');
  });

  it('infers current_track scope when user asks about current audio', () => {
    const result = resolveLocalToolCalls(
      [{ name: 'search_units', arguments: { query: 'hello' } }],
      '当前音频里搜索 hello',
      {},
    );
    expect(result.calls[0]?.arguments.scope).toBe('current_track');
  });

  it('upgrades current selection lookup to project stats for speaker-count questions', () => {
    const result = resolveLocalToolCalls(
      [{ name: 'get_current_selection', arguments: {} }],
      '当前有多少说话人',
      {},
    );
    expect(result.calls[0]).toEqual({
      name: 'get_project_stats',
      arguments: { scope: 'current_track', metric: 'speaker_count' },
    });
  });

  it('builds a dynamic active-tool subset for count questions', () => {
    const plan = resolveLocalToolRoutingPlan('当前有多少说话人', {});
    expect(plan.queryFamily).toBe('count');
    expect(plan.requestedMetric).toBe('speaker_count');
    expect(plan.selectedTools).toEqual(['get_project_stats']);
    expect(plan.scope).toBe('current_track');
  });

  it('routes layer list questions to list_layers', () => {
    const plan = resolveLocalToolRoutingPlan('当前的层都是什么内容', {});
    expect(plan.queryFamily).toBe('list');
    expect(plan.selectedTools).toEqual(['list_layers']);
  });

  it('routes layer link questions to list_layer_links', () => {
    const plan = resolveLocalToolRoutingPlan('翻译层都绑定到了哪个宿主层', {});
    expect(plan.queryFamily).toBe('list');
    expect(plan.selectedTools).toEqual(['list_layer_links']);
  });

  it('routes unsaved-draft questions to get_unsaved_drafts', () => {
    const plan = resolveLocalToolRoutingPlan('现在有哪些未保存草稿', {});
    expect(plan.queryFamily).toBe('selection');
    expect(plan.selectedTools).toEqual(['get_unsaved_drafts']);
  });

  it('routes speaker list questions to list_speakers', () => {
    const plan = resolveLocalToolRoutingPlan('当前有哪些说话人', {});
    expect(plan.queryFamily).toBe('list');
    expect(plan.selectedTools).toEqual(['list_speakers']);
  });

  it('routes speaker distribution questions to get_speaker_breakdown', () => {
    const plan = resolveLocalToolRoutingPlan('按说话人统计当前音频里各有多少语段', {});
    expect(plan.queryFamily).toBe('count');
    expect(plan.selectedTools).toEqual(['get_speaker_breakdown']);
    expect(plan.scope).toBe('current_track');
  });

  it('routes note list questions to list_notes', () => {
    const plan = resolveLocalToolRoutingPlan('当前笔记情况是什么', {});
    expect(plan.queryFamily).toBe('list');
    expect(plan.selectedTools).toEqual(['list_notes']);
  });

  it('routes visible timeline state questions to get_visible_timeline_state', () => {
    const plan = resolveLocalToolRoutingPlan('当前可见时间轴状态是什么', {});
    expect(plan.queryFamily).toBe('selection');
    expect(plan.selectedTools).toEqual(['get_visible_timeline_state']);
  });

  it('routes note detail questions to list_notes_detail', () => {
    const plan = resolveLocalToolRoutingPlan('把最近笔记明细列出来', {});
    expect(plan.queryFamily).toBe('list');
    expect(plan.selectedTools).toEqual(['list_notes_detail']);
  });

  it('routes zoom questions to get_visible_timeline_state', () => {
    const plan = resolveLocalToolRoutingPlan('当前时间轴缩放和刻度是多少', {});
    expect(plan.queryFamily).toBe('selection');
    expect(plan.selectedTools).toEqual(['get_visible_timeline_state']);
  });

  it('fills scope for get_speaker_breakdown calls', () => {
    const result = resolveLocalToolCalls(
      [{ name: 'get_speaker_breakdown', arguments: {} }],
      '全项目按说话人分布',
      {},
    );
    expect(result.calls[0]).toMatchObject({
      name: 'get_speaker_breakdown',
      arguments: { scope: 'project' },
    });
  });

  it('reroutes unfinished transcription count questions to quality diagnosis instead of total stats', () => {
    const result = resolveLocalToolCalls(
      [{ name: 'get_current_selection', arguments: {} }],
      '还有多少未转写',
      {},
    );
    expect(result.calls[0]).toEqual({
      name: 'diagnose_quality',
      arguments: { scope: 'current_track', metric: 'untranscribed_count' },
    });
  });

  it('reuses previous gap metric for follow-up count question', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'stats.get',
        lastScope: 'current_track',
        lastFrame: {
          domain: 'project_stats',
          questionKind: 'count',
          metric: 'untranscribed_count',
          metricCategory: 'gap',
          scope: 'current_track',
          source: 'tool',
          updatedAt: '2026-04-14T00:00:00.000Z',
        },
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const result = resolveLocalToolCalls(
      [{ name: 'get_project_stats', arguments: {} }],
      '那还剩多少',
      memory,
    );
    expect(result.calls[0]).toEqual({
      name: 'diagnose_quality',
      arguments: { scope: 'current_track', metric: 'untranscribed_count' },
    });
  });

  it('infers project scope when user asks for global totals', () => {
    const result = resolveLocalToolCalls(
      [{ name: 'list_units', arguments: { limit: 5 } }],
      '列出全项目所有语段',
      {},
    );
    expect(result.calls[0]?.arguments.scope).toBe('project');
  });

  it('reuses previous stats metric for bare count follow-up', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'stats.get',
        lastScope: 'project',
        lastFrame: {
          domain: 'project_stats',
          questionKind: 'count',
          metric: 'speaker_count',
          scope: 'project',
          source: 'tool',
          updatedAt: '2026-04-14T00:00:00.000Z',
        },
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const result = resolveLocalToolCalls(
      [{ name: 'get_project_stats', arguments: {} }],
      '多少',
      memory,
    );
    expect(result.calls[0]).toEqual({
      name: 'get_project_stats',
      arguments: { scope: 'project', metric: 'speaker_count' },
    });
  });

  it('switches stats scope from follow-up text while keeping the metric', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'stats.get',
        lastScope: 'project',
        lastFrame: {
          domain: 'project_stats',
          questionKind: 'count',
          metric: 'speaker_count',
          scope: 'project',
          source: 'tool',
          updatedAt: '2026-04-14T00:00:00.000Z',
        },
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const result = resolveLocalToolCalls(
      [{ name: 'get_project_stats', arguments: {} }],
      '那当前音频呢',
      memory,
    );
    expect(result.calls[0]).toEqual({
      name: 'get_project_stats',
      arguments: { scope: 'current_track', metric: 'speaker_count' },
    });
  });

  it('records semantic stats frame from successful project stats result', () => {
    const patch = buildLocalToolStatePatchFromCallResult(
      { name: 'get_project_stats', arguments: { metric: 'speaker_count', scope: 'project' } },
      { ok: true, result: { speakerCount: 3 } },
    );
    expect(patch.lastIntent).toBe('stats.get');
    expect(patch.lastScope).toBe('project');
    expect(patch.lastFrame).toMatchObject({
      domain: 'project_stats',
      questionKind: 'count',
      metric: 'speaker_count',
      scope: 'project',
    });
  });

  it('upgrades detail lookup to linguistic memory when user asks for gloss/notes', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'unit.list',
        lastResultUnitIds: ['utt-1', 'utt-2'],
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const result = resolveLocalToolCalls(
      [{ name: 'get_unit_detail', arguments: {} }],
      '看第2个语段的词素和注释',
      memory,
    );
    expect(result.calls[0]).toEqual({
      name: 'get_unit_linguistic_memory',
      arguments: {
        unitId: 'utt-2',
        scope: 'current_scope',
        includeNotes: true,
        includeMorphemes: true,
      },
    });
  });

  it('detects metric clarification need for bare count question without memory metric', () => {
    const calls = resolveLocalToolCalls(
      [{ name: 'get_project_stats', arguments: {} }],
      '多少',
      {},
    ).calls;
    expect(detectLocalToolClarificationNeed(calls, '多少', {})).toEqual({
      needed: true,
      reason: 'metric_ambiguous',
      callName: 'get_project_stats',
    });
  });

  it('detects scope clarification when metric is clear but scope is not', () => {
    const calls = resolveLocalToolCalls(
      [{ name: 'get_project_stats', arguments: { metric: 'speaker_count' } }],
      '有多少说话人',
      {},
    ).calls;
    expect(detectLocalToolClarificationNeed(calls, '有多少说话人', {})).toEqual({
      needed: true,
      reason: 'scope_ambiguous',
      callName: 'get_project_stats',
    });
  });

  it('does not require scope clarification when tool call already has explicit scope', () => {
    const calls = resolveLocalToolCalls(
      [{ name: 'get_project_stats', arguments: { metric: 'speaker_count', scope: 'current_scope' } }],
      '有多少说话人',
      {},
    ).calls;
    expect(detectLocalToolClarificationNeed(calls, '有多少说话人', {})).toEqual({ needed: false });
  });

  it('does not require metric clarification when previous count metric exists', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'stats.get',
        lastScope: 'project',
        lastFrame: {
          domain: 'project_stats',
          questionKind: 'count',
          metric: 'speaker_count',
          scope: 'project',
          source: 'tool',
          updatedAt: '2026-04-14T00:00:00.000Z',
        },
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const calls = resolveLocalToolCalls(
      [{ name: 'get_project_stats', arguments: {} }],
      '多少',
      memory,
    ).calls;
    expect(detectLocalToolClarificationNeed(calls, '多少', memory)).toEqual({ needed: false });
  });

  it('detects target clarification for detail call without resolvable unit id', () => {
    const calls = resolveLocalToolCalls(
      [{ name: 'get_unit_detail', arguments: {} }],
      '看一下详情',
      {},
    ).calls;
    expect(detectLocalToolClarificationNeed(calls, '看一下详情', {})).toEqual({
      needed: true,
      reason: 'target_ambiguous',
      callName: 'get_unit_detail',
    });
  });

  it('detects query clarification for empty search request', () => {
    const calls = [{ name: 'search_units', arguments: { query: '' } }] as const;
    expect(detectLocalToolClarificationNeed([...calls], '帮我搜一下', {})).toEqual({
      needed: true,
      reason: 'query_ambiguous',
      callName: 'search_units',
    });
  });

  it('detects action clarification for batch_apply without explicit action', () => {
    const calls = resolveLocalToolCalls(
      [{ name: 'batch_apply', arguments: { unitIds: ['u1'] } }],
      '把这些处理一下',
      {},
    ).calls;
    expect(detectLocalToolClarificationNeed(calls, '把这些处理一下', {})).toEqual({
      needed: true,
      reason: 'action_ambiguous',
      callName: 'batch_apply',
    });
  });

  it('detects target clarification for batch_apply without target ids', () => {
    const calls = resolveLocalToolCalls(
      [{ name: 'batch_apply', arguments: { action: 'verify' } }],
      '批量标记完成',
      {},
    ).calls;
    expect(detectLocalToolClarificationNeed(calls, '批量标记完成', {})).toEqual({
      needed: true,
      reason: 'target_ambiguous',
      callName: 'batch_apply',
    });
  });

  it('reuses previous list targets for follow-up batch_apply request', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'unit.list',
        lastResultUnitIds: ['u1', 'u2'],
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const calls = resolveLocalToolCalls(
      [{ name: 'batch_apply', arguments: {} }],
      '把这些都删除',
      memory,
    ).calls;
    expect(calls[0]).toEqual({
      name: 'batch_apply',
      arguments: {
        action: 'delete',
        unitIds: ['u1', 'u2'],
      },
    });
    expect(detectLocalToolClarificationNeed(calls, '把这些都删除', memory)).toEqual({ needed: false });
  });
});
