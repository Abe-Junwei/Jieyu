import { describe, expect, it } from 'vitest';
import {
  AI_TOOL_POLICY_MATRIX,
  getAiToolLayerLinkActionKind,
  getAiToolLayerLinkExecutionToolNames,
  getAiToolPolicy,
  getAiToolSegmentExecutionToolNames,
  isAiToolDestructive,
  isAiToolLayerLinkWithExplicitTarget,
  isAiToolSegmentExecutionWithExplicitTarget,
  isAiToolSegmentTargetMaterializationTool,
  isAiToolSegmentWriteWithExplicitTarget,
} from './aiToolPolicyMatrix';

describe('aiToolPolicyMatrix', () => {
  it('marks set_transcription_text as segment write with explicit target', () => {
    expect(isAiToolSegmentWriteWithExplicitTarget('set_transcription_text')).toBe(true);
  });

  it('marks delete_layer as destructive with host modal confirmation', () => {
    const policy = getAiToolPolicy('delete_layer');
    expect(policy.destructive).toBe(true);
    expect(policy.confirmationMode).toBe('host_modal');
    expect(isAiToolDestructive('delete_layer')).toBe(true);
  });

  it('marks propose_changes as pending_propose_changes flow', () => {
    const policy = getAiToolPolicy('propose_changes');
    expect(policy.confirmationMode).toBe('pending_propose_changes');
    expect(policy.auditReasonCodes).toContain('invalid_proposed_changes');
  });

  it('does not classify destructive segment deletion as non-destructive explicit-target write', () => {
    expect(isAiToolSegmentWriteWithExplicitTarget('delete_transcription_segment')).toBe(false);
  });

  it('ensures explicit-target tools keep non-empty audit reason codes', () => {
    const explicitTargetPolicies = Object.values(AI_TOOL_POLICY_MATRIX).filter((policy) => policy.requiresExplicitTarget);
    expect(explicitTargetPolicies.length).toBeGreaterThan(0);
    expect(explicitTargetPolicies.every((policy) => policy.auditReasonCodes.length > 0)).toBe(true);
  });

  it('ensures destructive tools use host modal confirmation', () => {
    const destructivePolicies = Object.values(AI_TOOL_POLICY_MATRIX).filter((policy) => policy.destructive);
    expect(destructivePolicies.length).toBeGreaterThan(0);
    expect(destructivePolicies.every((policy) => policy.confirmationMode === 'host_modal')).toBe(true);
  });

  it('keeps segment execution tool names aligned with explicit-target segment execution helper', () => {
    const toolNames = getAiToolSegmentExecutionToolNames();
    expect(toolNames.length).toBeGreaterThan(0);
    expect(toolNames.every((toolName) => isAiToolSegmentExecutionWithExplicitTarget(toolName))).toBe(true);
    expect(isAiToolSegmentExecutionWithExplicitTarget('auto_gloss_unit')).toBe(true);
  });

  it('excludes merge_transcription_segments from target materialization helper', () => {
    expect(isAiToolSegmentExecutionWithExplicitTarget('merge_transcription_segments')).toBe(true);
    expect(isAiToolSegmentTargetMaterializationTool('merge_transcription_segments')).toBe(false);
    expect(isAiToolSegmentTargetMaterializationTool('set_transcription_text')).toBe(true);
  });

  it('keeps layer-link execution tool names aligned with explicit-target layer-link helper', () => {
    const toolNames = getAiToolLayerLinkExecutionToolNames();
    expect(toolNames.length).toBeGreaterThan(0);
    expect(toolNames.every((toolName) => isAiToolLayerLinkWithExplicitTarget(toolName))).toBe(true);
    expect(isAiToolLayerLinkWithExplicitTarget('delete_layer')).toBe(false);
  });

  it('maps layer-link tools to stable action kinds', () => {
    expect(getAiToolLayerLinkActionKind('link_translation_layer')).toBe('add_host');
    expect(getAiToolLayerLinkActionKind('add_host')).toBe('add_host');
    expect(getAiToolLayerLinkActionKind('unlink_translation_layer')).toBe('remove_host');
    expect(getAiToolLayerLinkActionKind('remove_host')).toBe('remove_host');
    expect(getAiToolLayerLinkActionKind('switch_preferred_host')).toBe('switch_preferred_host');
    expect(getAiToolLayerLinkActionKind('delete_layer')).toBe(null);
  });
});
