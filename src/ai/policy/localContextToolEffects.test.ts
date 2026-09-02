import { describe, expect, it } from 'vitest';
import type { LocalContextToolName } from '../chat/localContextToolTypes';
import {
  LOCAL_CONTEXT_TOOL_NAMES,
  LOCAL_CONTEXT_TOOL_POLICY,
  getLocalContextToolEffect,
  getLocalContextToolPolicy,
  isReadOnlyLocalContextToolName,
} from './localContextToolEffects';

const LOCAL_CONTEXT_TOOL_NAME_UNION: readonly LocalContextToolName[] = [
  'get_current_selection',
  'list_layers',
  'list_layer_links',
  'get_unsaved_drafts',
  'list_speakers',
  'list_notes',
  'list_notes_detail',
  'get_visible_timeline_state',
  'get_speaker_breakdown',
  'get_project_stats',
  'get_waveform_analysis',
  'get_acoustic_summary',
  'find_incomplete_units',
  'diagnose_quality',
  'batch_apply',
  'suggest_next_action',
  'list_units',
  'search_units',
  'get_unit_detail',
  'get_unit_linguistic_memory',
];

describe('localContextToolEffects catalog parity', () => {
  it('registers every localContextTools name with effect and scopeBinding', () => {
    expect([...LOCAL_CONTEXT_TOOL_NAMES].sort()).toEqual([...LOCAL_CONTEXT_TOOL_NAME_UNION].sort());
    expect(Object.keys(LOCAL_CONTEXT_TOOL_POLICY).sort()).toEqual(
      [...LOCAL_CONTEXT_TOOL_NAME_UNION].sort(),
    );
    for (const name of LOCAL_CONTEXT_TOOL_NAME_UNION) {
      const policy = getLocalContextToolPolicy(name);
      expect(
        policy.effect === 'read' || policy.effect === 'write' || policy.effect === 'destructive',
      ).toBe(true);
      expect(policy.scopeBinding.length).toBeGreaterThan(0);
    }
  });

  it('keeps batch_apply as the only write_preview local tool', () => {
    const writeTools = LOCAL_CONTEXT_TOOL_NAME_UNION.filter(
      (name) => getLocalContextToolEffect(name) !== 'read',
    );
    expect(writeTools).toEqual(['batch_apply']);
    expect(getLocalContextToolPolicy('batch_apply').effect).toBe('write');
    expect(isReadOnlyLocalContextToolName('search_units')).toBe(true);
    expect(isReadOnlyLocalContextToolName('batch_apply')).toBe(false);
    expect(isReadOnlyLocalContextToolName('not_a_tool')).toBe(false);
  });
});
