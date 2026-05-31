import { describe, expect, it } from 'vitest';
import {
  annotateToolResult,
  assessToolResultQuality,
  classifyAgentLoopToolFailure,
} from './agentLoopResultQuality';
import type { LocalContextToolResult } from './localContextToolTypes';

describe('annotateToolResult', () => {
  it('flags a failed tool as tool_failed (and nothing else)', () => {
    const r: LocalContextToolResult = {
      ok: false,
      name: 'get_unit_detail',
      result: null,
      error: 'unit not found',
    };
    expect(annotateToolResult(r)).toEqual(['tool_failed']);
  });

  it('flags search_units with count===0 as search_no_results only', () => {
    const r: LocalContextToolResult = {
      ok: true,
      name: 'search_units',
      result: { count: 0, matches: [] },
    };
    expect(annotateToolResult(r)).toEqual(['search_no_results']);
  });

  it('does not flag search_units with matches', () => {
    const r: LocalContextToolResult = {
      ok: true,
      name: 'search_units',
      result: { count: 2, matches: [{ id: 'u1' }, { id: 'u2' }] },
    };
    expect(annotateToolResult(r)).toEqual([]);
  });

  it('flags an empty array result as empty_result', () => {
    const r: LocalContextToolResult = { ok: true, name: 'list_units', result: [] };
    expect(annotateToolResult(r)).toEqual(['empty_result']);
  });

  it('flags an empty object result as empty_result', () => {
    const r: LocalContextToolResult = { ok: true, name: 'get_project_stats', result: {} };
    expect(annotateToolResult(r)).toEqual(['empty_result']);
  });

  it('does not flag a healthy non-empty result', () => {
    const r: LocalContextToolResult = {
      ok: true,
      name: 'get_project_stats',
      result: { value: 42 },
    };
    expect(annotateToolResult(r)).toEqual([]);
  });
});

describe('assessToolResultQuality', () => {
  it('returns [] for undefined / empty input', () => {
    expect(assessToolResultQuality(undefined)).toEqual([]);
    expect(assessToolResultQuality([])).toEqual([]);
  });

  it('returns only entries that carry annotations', () => {
    const results: LocalContextToolResult[] = [
      { ok: true, name: 'get_project_stats', result: { value: 42 } }, // healthy → omitted
      { ok: true, name: 'search_units', result: { count: 0, matches: [] } }, // flagged
      { ok: false, name: 'get_unit_detail', result: null, error: 'unit not found' }, // flagged
    ];
    expect(assessToolResultQuality(results)).toEqual([
      { name: 'search_units', ok: true, annotations: ['search_no_results'] },
      { name: 'get_unit_detail', ok: false, annotations: ['tool_failed'] },
    ]);
  });

  it('returns [] when every result is healthy', () => {
    const results: LocalContextToolResult[] = [
      { ok: true, name: 'list_units', result: [{ id: 'u1' }] },
      { ok: true, name: 'get_project_stats', result: { value: 1 } },
    ];
    expect(assessToolResultQuality(results)).toEqual([]);
  });
});

describe('classifyAgentLoopToolFailure', () => {
  it('classifies retryable transport errors', () => {
    expect(
      classifyAgentLoopToolFailure([
        { ok: false, name: 'list_layers', result: null, error: 'upstream timeout' },
      ]),
    ).toEqual({ messageKey: 'agentLoopToolRetryableError', reason: 'retryable_transport' });
  });

  it('classifies validation errors', () => {
    expect(
      classifyAgentLoopToolFailure([
        { ok: false, name: 'get_unit_detail', result: null, error: 'unitId is required' },
      ]),
    ).toEqual({ messageKey: 'agentLoopToolValidationError', reason: 'validation_or_not_found' });
  });

  it('returns null when all tools succeeded', () => {
    expect(
      classifyAgentLoopToolFailure([{ ok: true, name: 'list_units', result: [{ id: 'u1' }] }]),
    ).toBeNull();
  });
});
