import { patternRule } from './rule-builders.mjs';

/**
 * Pattern guards that appear before the CSS contract spread (pages bulk, cross-layer, hooks/services/ai).
 * Phase 0.4 — split from `architecture-guard.config.mjs`.
 */
export const architectureGuardPreCssPatternRules = [
  patternRule(/^src\/pages\/(?:[^/]+\/)*use.*Controller\.ts$/, {
    excludeFiles: [
      'src/pages/useBatchOperationController.ts',
      'src/pages/useSpeakerActionRoutingController.ts',
      'src/pages/useSpeakerActionScopeController.ts',
      'src/pages/useTrackDisplayController.ts',
      'src/pages/useTrackEntityPersistenceController.ts',
      'src/pages/useTrackEntityStateController.ts',
      'src/pages/useTranscriptionAiController.ts',
      'src/pages/useTranscriptionAssistantController.ts',
      'src/pages/useTranscriptionProjectMediaController.ts',
      'src/pages/useTranscriptionSelectionContextController.ts',
      'src/pages/useTranscriptionSegmentBridgeController.ts',
      'src/pages/useTranscriptionSegmentCreationController.ts',
      'src/pages/useTranscriptionSegmentMutationController.ts',
      'src/pages/useTranscriptionShellController.ts',
      'src/pages/useTranscriptionTimelineController.ts',
      'src/pages/useTranscriptionTimelineInteractionController.ts',
      'src/pages/useTranscriptionWaveformBridgeController.ts',
      'src/pages/useTranscriptionWorkspaceLayoutController.ts',
      'src/pages/useWaveformRuntimeController.ts',
      'src/pages/useWaveformSelectionController.ts',
    ],
    maxLines: 800,
    maxUseCallbackDecls: 20,
    maxUseMemoDecls: 15,
    maxUseEffects: 5,
    warnAtRatio: 0.85,
    requiredRegexes: [/export function use[A-Za-z0-9]+Controller\(/],
  }),
  // ── Phase D: 写入口不得直接依赖 fallback owner 解析 | Write paths must not directly depend on fallback owner resolution ──
  patternRule(/^src\/pages\/(?!.*\.test\.).*\.(ts|tsx)$/, {
    excludeFiles: [
      'src/pages/transcriptionSelectionOwnerResolver.ts',
      'src/pages/useTranscriptionSelectionContextController.ts',
    ],
    forbiddenRegexes: [
      /resolveFallbackOwnerUnit\(/,
    ],
  }),
  // ── 串层污染防护：新代码禁止引用 deprecated 的 segment→host 别名 ──
  // Cross-layer contamination guard: forbid deprecated segment→host alias in new code.
  patternRule(/^src\/(?!.*\.test\.).*\.(ts|tsx)$/, {
    excludeFiles: [
      'src/pages/timelineUnitViewUnitHelpers.ts',
    ],
    forbiddenRegexes: [
      /\bresolveSpeakerTargetUnitIdFromUnitId\b/,
    ],
  }),
  // ── segment → 宿主 unit 的时间重叠解析严禁在「use*Controller」写路径里出现 ──
  // Segment→host time-overlap resolvers must not appear inside write-path controllers.
  // They are READ-ONLY / navigation-only helpers (see src/utils/segmentHostResolution.ts).
  patternRule(/^src\/pages\/(?:[^/]+\/)*use[A-Za-z0-9]+Controller\.(ts|tsx)$/, {
    excludeFiles: [
      // ⚠️ 选择解析涉及"在当前层找宿主 unit"的合法导航场景，仍需 host resolver 做只读查找。
      //   它不是 per-layer 字段写入路径（不写 selfCertainty/status/provenance）。
      'src/pages/useTranscriptionSelectionContextController.ts',
    ],
    excludeRegexes: [/\.test\./, /\.structure\./],
    forbiddenRegexes: [
      /\bresolveHostUnitCascadeMedia\b/,
      /\bresolveHostUnitStrictMedia\b/,
      /\bselectBestHostByTimeOverlap\b/,
      /\bresolveSelfCertaintyHostUnitId\b/,
    ],
  }),
  // ── UI 层 per-layer 字段严禁裸 `?? xxx.selfCertainty / .status / .provenance` 回退 ──
  // UI layer must not `??`-fall-back to host/parent-unit per-layer fields without a kind guard.
  // Safe form: `?? (unit.kind !== 'segment' ? x.selfCertainty : undefined)` — after `??` comes `(`.
  // Unsafe form blocked: `?? ident?.selfCertainty` etc.
  // 背景：UI 直连回退把被串层污染的 host unit 字段放大为可见角标/状态，详见
  //   self-certainty 串层 post-mortem。
  patternRule(/^src\/components\/.*\.tsx$/, {
    excludeRegexes: [/\.test\./, /\.structure\./],
    forbiddenRegexes: [
      /\?\?\s+[A-Za-z_$][\w$]*\??\.(selfCertainty|status|provenance)\b/,
    ],
  }),
  // ── `saveUnitLayerFields` 等 per-layer 写入枢纽：禁止再引入 segment→host 解析依赖 ──
  patternRule(/^src\/hooks\/useTranscriptionUnitActions\.ts$/, {
    forbiddenRegexes: [
      /from\s+['"][^'"]*segmentHostResolution['"]/,
      /\bresolveHostUnit(Strict|Cascade)Media\b/,
      /\bresolveSelfCertaintyHostUnitId\b/,
      /\bresolveFallbackOwnerUnit\b/,
    ],
  }),
  // ── 写路径不得把 read-only 映射 helper 结果当持久化 id ──
  // Complementary guard: keep resolveMappedUnitIds / resolveHostUnitIdForTimelineView out of persistence hubs.
  patternRule(/^(src\/hooks\/useTranscription(UnitActions|CloudSyncActions)\.ts|src\/pages\/(?:[^/]+\/)*useTranscription(?!SelectionContext)[A-Za-z0-9]+Controller\.(ts|tsx))$/, {
    excludeFiles: [
      'src/pages/useSpeakerActionScopeController.ts',
    ],
    excludeRegexes: [/\.test\./, /\.structure\./],
    forbiddenRegexes: [
      /\bresolveMappedUnitIds(?:FromSelection)?\(/,
      /\bresolveHostUnitIdForTimelineView\(/,
    ],
  }),
  patternRule(/^src\/hooks\/(?:[^/]+\/)*use.*\.(ts|tsx)$/, {
    excludeFiles: [
      'src/hooks/useVoiceAgent.ts',
      'src/hooks/useTranscriptionData.ts',
    ],
    excludeRegexes: [/\.test\./, /\.structure\./],
    maxLines: 1500,
    maxUseCallbackDecls: 25,
    maxUseMemoDecls: 15,
    maxUseEffects: 15,
    warnAtRatio: 0.85,
  }),
  patternRule(/^src\/services\/(?:[^/]+\/)*.*Service\.ts$/, {
    excludeFiles: [
      'src/services/VoiceAgentService.ts',
      'src/services/GlobalContextService.ts',
    ],
    maxLines: 2000,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 0,
    maxUseEffects: 0,
    warnAtRatio: 0.85,
    forbiddenRegexes: [
      /from ['\"]react['\"]/, 
      /\buseState\(/,
      /\buseEffect\(/,
      /\buseCallback\(/,
      /\buseMemo\(/,
      /\buseRef\(/,
    ],
  }),
  // ── AI Chat 层：超大文件专项治理 ──
  // 批量规则：覆盖所有 chat 层文件（排除已单独设限的超大文件）
  patternRule(/^src\/ai\/chat\/.*\.(ts|tsx)$/, {
    excludeFiles: [
    ],
    excludeRegexes: [/\.test\./, /\.structure\./],
    maxLines: 1000,
    maxUseCallbackDecls: 0,
    maxUseMemoDecls: 0,
    maxUseEffects: 0,
    warnAtRatio: 0.85,
    forbiddenRegexes: [
      /\buseState\(/,
      /\buseEffect\(/,
      /\buseCallback\(/,
      /\buseMemo\(/,
      /\buseRef\(/,
    ],
  }),


  patternRule(/^src\/pages\/(?!use).*\.(ts|tsx)$/, {
    excludeFiles: ['src/pages/TranscriptionPage.Orchestrator.tsx', 'src/pages/TranscriptionPage.ReadyWorkspace.tsx'],
    excludeRegexes: [/\.test\./, /\.structure\./],
    maxLines: 800,
    maxUseCallbackDecls: 8,
    maxUseMemoDecls: 8,
    maxUseEffects: 10,
    warnAtRatio: 0.85,
  }),
];
