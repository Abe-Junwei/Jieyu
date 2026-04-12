/**
 * M3 页面编排迁移清单 — 按域 × 优先级排序
 * M3 page orchestration migration checklist — sorted by domain × priority
 *
 * 本清单记录所有页面层直连 db / services 的文件及其迁移状态。
 * 新增功能禁止在以下文件中新增 db / services 直连，应通过 src/app/ 应用服务层接入。
 *
 * 迁移策略：绞杀者模式（Strangler Fig）
 * - M3（本阶段）：冻结基线，新增走 app 层，不强制改老代码
 * - M4（下阶段）：按优先级逐文件迁移，旧入口改为转发新应用服务
 */

export type MigrationPriority = 'P0-critical' | 'P1-high' | 'P2-medium' | 'P3-low';
export type MigrationDomain = 'transcription' | 'ai' | 'language-assets' | 'cross-domain';
export type MigrationStatus = 'frozen' | 'in-progress' | 'migrated';

export interface MigrationEntry {
  /** 文件相对路径 | File relative path */
  file: string;
  /** 所属域 | Domain */
  domain: MigrationDomain;
  /** 迁移优先级 | Migration priority */
  priority: MigrationPriority;
  /** 当前状态 | Current status */
  status: MigrationStatus;
  /** 直连 db 导入数 | Direct db import count */
  dbImports: number;
  /** 直连 services 导入数 | Direct services import count */
  serviceImports: number;
  /** 迁移说明 | Migration notes */
  notes: string;
}

/**
 * M3 基线冻结清单 | M3 baseline freeze checklist
 *
 * 排列规则 | Sorting rules:
 * 1. 按域分组（转写 → AI → 语言资产 → 跨域）
 * 2. 域内按 (dbImports + serviceImports) 降序
 * 3. 同数量按文件名字母序
 */
export const m3MigrationChecklist: MigrationEntry[] = [
  // ── 转写域 | Transcription domain ──
  {
    file: 'src/pages/useTranscriptionProjectMediaController.ts',
    domain: 'transcription',
    priority: 'P0-critical',
    status: 'migrated',
    dbImports: 1,
    serviceImports: 3,
    notes: 'Migrated to app forwarding layer in M4, legacy entry kept for compatibility',
  },
  {
    file: 'src/pages/TranscriptionPage.runtimeProps.ts',
    domain: 'transcription',
    priority: 'P0-critical',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 2,
    notes: 'Runtime props aggregation point, consumed by ReadyWorkspace',
  },
  {
    file: 'src/pages/TranscriptionPage.runtimeContracts.ts',
    domain: 'transcription',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 2,
    notes: 'Type contract file, type-only imports',
  },
  {
    file: 'src/pages/useTranscriptionSegmentBridgeController.ts',
    domain: 'transcription',
    priority: 'P0-critical',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 2,
    notes: 'Segment bridge controller, connects to LayerSegmentation service',
  },
  {
    file: 'src/pages/useTranscriptionRuntimeProps.ts',
    domain: 'transcription',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 2,
    notes: 'Runtime props assembly',
  },
  {
    file: 'src/pages/useTranscriptionTimelineInteractionController.ts',
    domain: 'transcription',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 2,
    notes: 'Timeline interaction controller',
  },
  {
    file: 'src/pages/useTranscriptionSegmentMutationController.ts',
    domain: 'transcription',
    priority: 'P0-critical',
    status: 'migrated',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Migrated to app forwarding layer in M4, no direct LayerSegmentationV2Service import',
  },
  {
    file: 'src/pages/useTranscriptionShellController.ts',
    domain: 'transcription',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Shell controller, manages lifecycle',
  },
  {
    file: 'src/pages/useTranscriptionDisplayStyleControl.ts',
    domain: 'transcription',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Display style controller',
  },
  {
    file: 'src/pages/useTranscriptionSegmentBatchMerge.ts',
    domain: 'transcription',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Batch merge operation',
  },
  {
    file: 'src/pages/transcriptionSegmentCreationActions.ts',
    domain: 'transcription',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Segment creation action set',
  },
  {
    file: 'src/pages/useSpeakerActionRoutingController.ts',
    domain: 'transcription',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Speaker action routing',
  },
  {
    file: 'src/pages/useTranscriptionAssistantController.ts',
    domain: 'transcription',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Assistant controller',
  },
  {
    file: 'src/pages/useBatchOperationController.ts',
    domain: 'transcription',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Batch operation controller',
  },
  {
    file: 'src/pages/TranscriptionPage.BatchOps.tsx',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Batch operations UI',
  },
  {
    file: 'src/pages/TranscriptionPage.citationJump.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Citation jump',
  },
  {
    file: 'src/pages/useTranscriptionWorkspaceLayoutController.ts',
    domain: 'transcription',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Workspace layout controller',
  },
  {
    file: 'src/pages/useTranscriptionTimelineController.ts',
    domain: 'transcription',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Timeline controller',
  },
  {
    file: 'src/pages/useTranscriptionSelectionContextController.ts',
    domain: 'transcription',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Selection context controller',
  },
  {
    file: 'src/pages/useSpeakerActionScopeController.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Speaker scope controller',
  },
  {
    file: 'src/pages/useSpeakerFocusController.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Speaker focus controller',
  },
  {
    file: 'src/pages/useTrackDisplayController.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Track display controller',
  },
  {
    file: 'src/pages/useWaveformSelectionController.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Waveform selection controller',
  },
  {
    file: 'src/pages/transcriptionSegmentRouting.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Segment routing helper',
  },
  {
    file: 'src/pages/transcriptionSelectionSnapshot.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Selection snapshot',
  },
  {
    file: 'src/pages/transcriptionSectionViewModelTypes.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Type-only file',
  },
  {
    file: 'src/pages/transcriptionTimelineTopProps.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Type-only file',
  },
  {
    file: 'src/pages/transcriptionWaveformBridge.types.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Type-only file',
  },
  {
    file: 'src/pages/OrchestratorWaveformContent.tsx',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Waveform content component',
  },
  {
    file: 'src/pages/useTranscriptionSpeakerController.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Speaker controller',
  },
  {
    file: 'src/pages/useTranscriptionAnalysisRuntimeProps.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Analysis runtime props',
  },
  {
    file: 'src/pages/useTrackEntityPersistenceController.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 1,
    notes: 'Track entity persistence',
  },
  {
    file: 'src/pages/useTrackEntityStateController.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 1,
    notes: 'Track entity state',
  },
  {
    file: 'src/pages/useWaveformAcousticOverlay.ts',
    domain: 'transcription',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 1,
    notes: 'Waveform acoustic overlay',
  },

  // ── AI 域 | AI domain ──
  {
    file: 'src/pages/useTranscriptionAiController.ts',
    domain: 'ai',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 1,
    notes: 'AI controller, routes intent & tool calls',
  },
  {
    file: 'src/pages/useTranscriptionAssistantRuntimeProps.ts',
    domain: 'ai',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 2,
    notes: 'Assistant runtime props',
  },
  {
    file: 'src/pages/transcriptionAssistantController.types.ts',
    domain: 'ai',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 2,
    notes: 'Type-only file',
  },
  {
    file: 'src/pages/transcriptionAiController.types.ts',
    domain: 'ai',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Type-only file',
  },
  {
    file: 'src/pages/transcriptionAiToolRiskCheck.ts',
    domain: 'ai',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'AI tool risk check',
  },
  {
    file: 'src/pages/transcriptionAssistantContextValue.ts',
    domain: 'ai',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Assistant context value',
  },
  {
    file: 'src/pages/useTranscriptionAiAcousticRuntime.ts',
    domain: 'ai',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 2,
    notes: 'AI acoustic runtime',
  },
  {
    file: 'src/pages/useTranscriptionAcousticPanelState.ts',
    domain: 'ai',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 1,
    notes: 'Acoustic panel state',
  },
  {
    file: 'src/pages/TranscriptionPage.AssistantBridge.tsx',
    domain: 'ai',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 1,
    notes: 'Assistant bridge component',
  },
  {
    file: 'src/pages/voiceDictationRuntime.ts',
    domain: 'ai',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Voice dictation runtime',
  },
  {
    file: 'src/pages/useTranscriptionAiController.segmentTargets.ts',
    domain: 'ai',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'AI controller segment targets',
  },

  // ── 语言资产域 | Language assets domain ──
  {
    file: 'src/pages/LanguageMetadataWorkspacePage.tsx',
    domain: 'language-assets',
    priority: 'P0-critical',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 4,
    notes: 'Language metadata main page, highest services import count',
  },
  {
    file: 'src/pages/languageMetadataWorkspace.shared.ts',
    domain: 'language-assets',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 2,
    notes: 'Shared helper module',
  },
  {
    file: 'src/pages/languageMetadataWorkspace.customFieldController.ts',
    domain: 'language-assets',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 2,
    notes: 'Custom field controller',
  },
  {
    file: 'src/pages/OrthographyBridgeWorkspacePage.tsx',
    domain: 'language-assets',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 2,
    notes: 'Orthography bridge page',
  },
  {
    file: 'src/pages/OrthographyManagerPage.tsx',
    domain: 'language-assets',
    priority: 'P1-high',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 2,
    notes: 'Orthography manager page',
  },
  {
    file: 'src/pages/LanguageMetadataWorkspaceCustomFieldDefinitionCard.tsx',
    domain: 'language-assets',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Custom field definition card',
  },
  {
    file: 'src/pages/LanguageMetadataWorkspaceCustomFieldValueField.tsx',
    domain: 'language-assets',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Custom field value component',
  },
  {
    file: 'src/pages/LanguageMetadataWorkspaceDetailColumn.tsx',
    domain: 'language-assets',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 1,
    notes: 'Detail column component',
  },
  {
    file: 'src/pages/OrthographyManagerPanel.tsx',
    domain: 'language-assets',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Orthography manager panel',
  },
  {
    file: 'src/pages/orthographyManager.shared.ts',
    domain: 'language-assets',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 0,
    notes: 'Orthography manager shared helper',
  },
  {
    file: 'src/pages/orthographyBrowse.shared.ts',
    domain: 'language-assets',
    priority: 'P3-low',
    status: 'frozen',
    dbImports: 0,
    serviceImports: 1,
    notes: 'Orthography browse shared helper',
  },
  {
    file: 'src/pages/LexiconPage.tsx',
    domain: 'language-assets',
    priority: 'P2-medium',
    status: 'frozen',
    dbImports: 1,
    serviceImports: 1,
    notes: 'Lexicon page',
  },
];

// ── 基线统计 | Baseline stats ──

export const m3BaselineStats = {
  generatedAt: '2026-04-12',
  totalFiles: m3MigrationChecklist.length,
  byDomain: {
    transcription: m3MigrationChecklist.filter((e) => e.domain === 'transcription').length,
    ai: m3MigrationChecklist.filter((e) => e.domain === 'ai').length,
    'language-assets': m3MigrationChecklist.filter((e) => e.domain === 'language-assets').length,
  },
  byPriority: {
    'P0-critical': m3MigrationChecklist.filter((e) => e.priority === 'P0-critical').length,
    'P1-high': m3MigrationChecklist.filter((e) => e.priority === 'P1-high').length,
    'P2-medium': m3MigrationChecklist.filter((e) => e.priority === 'P2-medium').length,
    'P3-low': m3MigrationChecklist.filter((e) => e.priority === 'P3-low').length,
  },
  totalDbImports: m3MigrationChecklist.reduce((s, e) => s + e.dbImports, 0),
  totalServiceImports: m3MigrationChecklist.reduce((s, e) => s + e.serviceImports, 0),
} as const;

// ── M4 首批迁移进度 | M4 first-batch migration progress ──

export const m4FirstBatchTargets = [
  'src/pages/useTranscriptionProjectMediaController.ts',
  'src/pages/useTranscriptionSegmentMutationController.ts',
] as const;

const m4FirstBatchTargetSet = new Set<string>(m4FirstBatchTargets);

const m4MigratedTargets = m3MigrationChecklist.filter((entry) => m4FirstBatchTargetSet.has(entry.file) && entry.status === 'migrated').length;
const m4TotalTargets: number = m4FirstBatchTargets.length;

export const m4FirstBatchStats = {
  generatedAt: '2026-04-12',
  totalTargets: m4TotalTargets,
  migratedTargets: m4MigratedTargets,
  corePageAppServiceAdoptionRate: m4TotalTargets === 0 ? 0 : m4MigratedTargets / m4TotalTargets,
  legacyEntrypointRatio: m4TotalTargets === 0 ? 0 : (m4TotalTargets - m4MigratedTargets) / m4TotalTargets,
} as const;
