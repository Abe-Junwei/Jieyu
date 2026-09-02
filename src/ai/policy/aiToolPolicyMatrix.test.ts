import { describe, expect, it } from 'vitest';
import {
  AI_TOOL_POLICY_MATRIX,
  aiToolSupportsPreview,
  getAiToolLayerLinkActionKind,
  getAiToolLayerLinkExecutionToolNames,
  getAiToolPolicy,
  getAiToolSegmentExecutionToolNames,
  isAiToolDestructive,
  isAiToolLayerLinkWithExplicitTarget,
  isAiToolSegmentExecutionWithExplicitTarget,
  isAiToolSegmentTargetMaterializationTool,
  isAiToolSegmentWriteWithExplicitTarget,
  isAiToolWritePreviewRequired,
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
    const explicitTargetPolicies = Object.values(AI_TOOL_POLICY_MATRIX).filter(
      (policy) => policy.requiresExplicitTarget,
    );
    expect(explicitTargetPolicies.length).toBeGreaterThan(0);
    expect(explicitTargetPolicies.every((policy) => policy.auditReasonCodes.length > 0)).toBe(true);
  });

  it('ensures destructive tools use host modal confirmation', () => {
    const destructivePolicies = Object.values(AI_TOOL_POLICY_MATRIX).filter(
      (policy) => policy.destructive,
    );
    expect(destructivePolicies.length).toBeGreaterThan(0);
    expect(destructivePolicies.every((policy) => policy.confirmationMode === 'host_modal')).toBe(
      true,
    );
  });

  it('keeps segment execution tool names aligned with explicit-target segment execution helper', () => {
    const toolNames = getAiToolSegmentExecutionToolNames();
    expect(toolNames.length).toBeGreaterThan(0);
    expect(
      toolNames.every((toolName) => isAiToolSegmentExecutionWithExplicitTarget(toolName)),
    ).toBe(true);
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

  it('marks write-like non-destructive tools as preview-supported', () => {
    expect(aiToolSupportsPreview('set_transcription_text')).toBe(true);
    expect(aiToolSupportsPreview('propose_changes')).toBe(true);
    expect(aiToolSupportsPreview('delete_transcription_segment')).toBe(false);
    expect(aiToolSupportsPreview('nav_to_segment')).toBe(false);
  });

  it('requires preview for auto-execute writes but not propose_changes parent flow', () => {
    expect(isAiToolWritePreviewRequired('set_token_gloss')).toBe(true);
    expect(isAiToolWritePreviewRequired('propose_changes')).toBe(false);
  });

  it('maps layer-link tools to stable action kinds', () => {
    expect(getAiToolLayerLinkActionKind('link_translation_layer')).toBe('add_host');
    expect(getAiToolLayerLinkActionKind('add_host')).toBe('add_host');
    expect(getAiToolLayerLinkActionKind('unlink_translation_layer')).toBe('remove_host');
    expect(getAiToolLayerLinkActionKind('remove_host')).toBe('remove_host');
    expect(getAiToolLayerLinkActionKind('switch_preferred_host')).toBe('switch_preferred_host');
    expect(getAiToolLayerLinkActionKind('delete_layer')).toBe(null);
  });

  it('fills effect and scopeBinding for every chat tool', () => {
    const entries = Object.values(AI_TOOL_POLICY_MATRIX);
    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries.every(
        (policy) =>
          (policy.effect === 'read' ||
            policy.effect === 'write' ||
            policy.effect === 'destructive') &&
          (policy.scopeBinding === 'none' ||
            policy.scopeBinding === 'current_selection' ||
            policy.scopeBinding === 'current_unit' ||
            policy.scopeBinding === 'current_layer' ||
            policy.scopeBinding === 'current_project'),
      ),
    ).toBe(true);
    expect(getAiToolPolicy('delete_layer').effect).toBe('destructive');
    expect(getAiToolPolicy('set_token_gloss').effect).toBe('write');
    expect(getAiToolPolicy('set_token_gloss').scopeBinding).toBe('current_unit');
    expect(getAiToolPolicy('nav_to_time').effect).toBe('read');
    expect(getAiToolPolicy('get_project_summary').scopeBinding).toBe('current_project');
  });
});
