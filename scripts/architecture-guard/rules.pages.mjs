import { pageControllerRule } from './rule-builders.mjs';

/**
 * Orchestrator / ReadyWorkspace file rules + named page controllers (`pageControllerRule`).
 * Extracted from `architecture-guard.config.mjs` (Phase 0.4).
 */
export const architectureGuardPageWorkspaceRules = [
  // ── Orchestrator: 轻量壳，仅装载数据并渲染 ReadyWorkspace | Lightweight shell ──
  {
    file: 'src/pages/TranscriptionPage.Orchestrator.tsx',
    maxLines: 100,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 0,
    maxUseEffects: 0,
  },
  // ── ReadyWorkspace: 承载全部运行时 hook 与 JSX | Runtime workspace with all hooks ──
  {
    file: 'src/pages/TranscriptionPage.ReadyWorkspace.tsx',
    maxLines: 2600,
    maxUseCallbackDecls: 8,
    maxUseMemoDecls: 10,
    maxUseEffects: 8,
    maxRegexMatchCounts: [
      {
        label: 'direct ../services imports',
        pattern: /^import .* from '\.\.\/services\//gm,
        max: 3,
      },
      {
        label: 'LinguisticService direct calls',
        pattern: /LinguisticService\./g,
        max: 6,
      },
      {
        label: 'LayerSegmentationV2Service direct content writes',
        pattern: /LayerSegmentationV2Service\.(deleteSegmentContent|upsertSegmentContent)\(/g,
        max: 2,
      },
      {
        label: 'LayerSegmentGraphService direct helper calls',
        pattern: /(snapshotLayerSegmentGraphByLayerIds|restoreLayerSegmentGraphSnapshot)\(/g,
        max: 2,
      },
    ],
    requiredRegexes: [
      /(?:useTranscriptionProjectMediaController\(\{|useReadyWorkspaceAudioCaptureController\()/,
      /useTranscriptionSelectionSnapshot\(\{/,
      /useTranscriptionSelectionContextController\(\{/,
      /useTranscriptionSegmentBridgeController\(\{/,
      /useTranscriptionShellController\(\{/,
      /useWaveformRuntimeController\(\)/,
      /useReadyWorkspaceTrackEditControllers\(\{/,
      /useTranscriptionAssistantController\(\{/,
      /useTranscriptionSegmentCreationController\(\{/,
      /useTranscriptionSegmentMutationController\(\{/,
      /useReadyWorkspaceTimelineSyncSetup\(\{/,
      /useReadyWorkspaceWaveformBridgeController\(\{/,
      /useTranscriptionWorkspaceLayoutController\(\{/,
      // Phase 9 — Timeline unit read model (CQRS) wiring must stay in ReadyWorkspace
      /useTimelineUnitViewIndex\(\{/,
      /timelineUnitsOnCurrentMedia:\s*timelineUnitViewIndex\.currentMediaUnits/,
      /timelineUnitViewIndex,\s*$/m,
    ],
    forbiddenLiterals: [
      'LayerSegmentationV2Service.createSegment(',
      'LayerSegmentationV2Service.createSegmentWithParentConstraint(',
      'LayerSegmentationV2Service.splitSegment(',
      'LayerSegmentationV2Service.mergeAdjacentSegments(',
      'LayerSegmentationV2Service.deleteSegment(',
      'LayerSegmentationV2Service.updateSegment(',
    ],
    warnAtRatio: 0.85,
  },
];

export const architectureGuardPageControllerRules = [
  pageControllerRule('useBatchOperationController', {
    maxLines: 130,
    maxUseCallbackDecls: 6,
    maxUseMemoDecls: 2,
    maxUseEffects: 0,
    requiredRegexes: [
      /export function useBatchOperationController\(/,
      /resolveUnitSelectionMapping\(\{/,
      /const selectedBatchUnitIdsSet = batchUnitSelectionMapping\.mappedUnitIds;/,
    ],
    forbiddenRegexes: [
      /resolveSegmentOnlyIdsFromSelection\(/,
    ],
  }),
  pageControllerRule('useSpeakerActionRoutingController', {
    maxLines: 1100,
    maxUseCallbackDecls: 22,
    maxUseMemoDecls: 8,
    maxUseEffects: 1,
    requiredRegexes: [
      /export function useSpeakerActionRoutingController\(/,
      /selectedUnitIdsForSpeakerActions\.filter\(\(id\) => !segmentByIdForSpeakerActions\.has\(id\)\)/,
      /recordMetric\(\{\s*id:\s*'business\.transcription\.speaker_mixed_selection_apply_count'/,
    ],
    forbiddenRegexes: [
      /selectedUnitIdsForSpeakerActionsSet/,
    ],
  }),
  pageControllerRule('useSpeakerActionScopeController', {
    maxLines: 250,
    maxUseCallbackDecls: 4,
    maxUseMemoDecls: 15,
    maxUseEffects: 0,
    requiredRegexes: [
      /export function useSpeakerActionScopeController\(/,
      /resolveSegmentOnlyIdsFromSelection\(\{/,
      /const selectedSegmentIdsForSpeakerActions = useMemo\(\(\) => \{/,
      /const selectedBatchSegmentsForSpeakerActions = useMemo\(/,
    ],
  }),
  pageControllerRule('useTranscriptionSpeakerController', {
    maxLines: 320,
    maxUseCallbackDecls: 3,
    maxUseMemoDecls: 6,
    maxUseEffects: 0,
  }),
  pageControllerRule('useTrackDisplayController', {
    maxLines: 260,
    maxUseCallbackDecls: 6,
    maxUseMemoDecls: 8,
    maxUseEffects: 2,
    requiredRegexes: [
      /export function useTrackDisplayController\(/,
      /timelineUnitsOnCurrentMedia\?:\s*ReadonlyArray<TimelineUnitView>/,
    ],
  }),
  pageControllerRule('useTranscriptionAssistantController', {
    maxLines: 305,
    maxUseCallbackDecls: 3,
    maxUseMemoDecls: 0,
    maxUseEffects: 1,
  }),
  pageControllerRule('useTranscriptionAiController', {
    maxLines: 620,
    maxUseCallbackDecls: 8,
    maxUseMemoDecls: 6,
    maxUseEffects: 4,
    requiredRegexes: [
      /export function useTranscriptionAiController\(/,
      // ADR-004 single-caliber: controllers must consume injected TimelineUnitViewIndex directly.
      /const effectiveUnitIndex = input\.timelineUnitViewIndex;/,
      // Prettier may break the RHS across lines; keep the guard anchored on the ternary condition.
      /const projectUnitsForTools\s*=\s*\n\s*effectiveUnitIndex\.isComplete \|\| effectiveUnitIndex\.allUnits\.length > 0/,
      /recordMetric\(\{\s*id:\s*'ai\.timeline_unit_count_mismatch'/,
      /layers:\s*input\.layers/,
      /recentActions:\s*formatRecentActions\(input\.recentTimelineEditEvents\)/,
      /unitCount:\s*effectiveUnitIndex\.totalCount/,
      /explicitOwnerUnitId:\s*explicitOwnerUnitForAi\?\.id/,
    ],
    forbiddenRegexes: [
      /explicitOwnerUnitId:\s*resolvedOwnerUnitForAi\?\.id/,
      /selectedSegmentTargetId\s*=\s*resolveOwnerUnitForAi\(/,
    ],
  }),
  pageControllerRule('useTranscriptionProjectMediaController', {
    maxLines: 300,
    maxUseCallbackDecls: 8,
    maxUseMemoDecls: 1,
    maxUseEffects: 0,
  }),
  pageControllerRule('useTranscriptionSelectionContextController', {
    maxLines: 220,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 12,
    maxUseEffects: 0,
  }),
  pageControllerRule('useTranscriptionSegmentCreationController', {
    maxLines: 170,
    maxUseCallbackDecls: 1,
    maxUseMemoDecls: 0,
    maxUseEffects: 0,
  }),
  pageControllerRule('useTranscriptionSegmentBridgeController', {
    maxLines: 260,
    maxUseCallbackDecls: 4,
    maxUseMemoDecls: 2,
    maxUseEffects: 2,
  }),
  pageControllerRule('useTranscriptionSegmentMutationController', {
    maxLines: 660,
    maxUseCallbackDecls: 12,
    maxUseMemoDecls: 2,
    maxUseEffects: 0,
    requiredRegexes: [
      /export function useTranscriptionSegmentMutationController\(/,
      /dispatchTimelineUnitMutation\(/,
      /dispatchTimelineUnitSelectionMutation\(/,
    ],
  }),
  pageControllerRule('useTranscriptionShellController', {
    maxLines: 410,
    maxUseCallbackDecls: 4,
    maxUseMemoDecls: 1,
    maxUseEffects: 7,
  }),
  pageControllerRule('useTranscriptionTimelineController', {
    maxLines: 220,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 7,
    maxUseEffects: 0,
  }),
  pageControllerRule('useTranscriptionTimelineInteractionController', {
    maxLines: 560,
    maxUseCallbackDecls: 20,
    maxUseMemoDecls: 0,
    maxUseEffects: 0,
  }),
  pageControllerRule('useTranscriptionWorkspaceLayoutController', {
    maxLines: 470,
    maxUseCallbackDecls: 10,
    maxUseMemoDecls: 0,
    maxUseEffects: 12,
  }),
  pageControllerRule('useTranscriptionWaveformBridgeController', {
    maxLines: 700,
    maxUseCallbackDecls: 12,
    maxUseMemoDecls: 3,
    maxUseEffects: 5,
    requiredRegexes: [
      /export function useTranscriptionWaveformBridgeController\(/,
      /timelineUnitViewIndex:\s*input\.timelineUnitViewIndex/,
    ],
  }),
  pageControllerRule('useWaveformRuntimeController', {
    maxLines: 130,
    maxUseCallbackDecls: 1,
    maxUseMemoDecls: 0,
    maxUseEffects: 3,
  }),
  pageControllerRule('useWaveformSelectionController', {
    maxLines: 170,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 7,
    maxUseEffects: 0,
    requiredRegexes: [
      /export function useWaveformSelectionController\(/,
      /timelineUnitViewIndex:\s*TimelineUnitViewIndexWithEpoch/,
    ],
  }),
  pageControllerRule('useTrackEntityStateController', {
    maxLines: 120,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 0,
    maxUseEffects: 2,
  }),
  pageControllerRule('useTrackEntityPersistenceController', {
    maxLines: 80,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 0,
    maxUseEffects: 1,
  }),
];

/**
 * ReadyWorkspace decomposition ratchets (paired with bulk `use*` pattern excludes).
 * Phase 0.4 — split from `architecture-guard.config.mjs`.
 */
export const architectureGuardPageRatchetFileRules = [
  {
    file: 'src/pages/useReadyWorkspaceSurfaceProps.tsx',
    maxLines: 650,
    maxUseCallbackDecls: 6,
    maxUseMemoDecls: 6,
    maxUseEffects: 4,
    warnAtRatio: 0.85,
    requiredRegexes: [/export function useReadyWorkspaceSurfaceProps\(/],
  },
  {
    file: 'src/pages/useReadyWorkspaceTrackEditControllers.ts',
    maxLines: 450,
    maxUseCallbackDecls: 6,
    maxUseMemoDecls: 6,
    maxUseEffects: 4,
    warnAtRatio: 0.85,
    requiredRegexes: [/export function useReadyWorkspaceTrackEditControllers\(/],
  },
];
