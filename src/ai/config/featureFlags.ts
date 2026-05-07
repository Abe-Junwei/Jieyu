// 系统功能开关 | System feature flags
type FeatureFlagDeploymentEnvironment = 'local' | 'dogfood' | 'staging' | 'prod';

function normalizeFeatureFlagDeploymentEnvironment(rawValue: string | undefined): FeatureFlagDeploymentEnvironment {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized) return import.meta.env.DEV ? 'local' : 'prod';
  if (normalized === 'development' || normalized === 'dev' || normalized === 'local') return 'local';
  if (normalized === 'production' || normalized === 'prod') return 'prod';
  if (normalized === 'dogfood') return 'dogfood';
  if (normalized === 'staging') return 'staging';
  return import.meta.env.DEV ? 'local' : 'prod';
}

function readOptionalBooleanFlag(rawValue: string | undefined): boolean | null {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return null;
}

const featureFlagDeploymentEnvironment = normalizeFeatureFlagDeploymentEnvironment(
  import.meta.env.VITE_M5_OBSERVABILITY_ENV ?? import.meta.env.MODE,
);

const aiBackgroundToolSandboxEnabledDefault = featureFlagDeploymentEnvironment === 'dogfood'
  || featureFlagDeploymentEnvironment === 'staging';

const aiBackgroundMemorySessionWriteQuotaEnabledDefault = featureFlagDeploymentEnvironment === 'dogfood'
  || featureFlagDeploymentEnvironment === 'staging';

const aiToolCallExecutorAutoRetryEnabledDefault = featureFlagDeploymentEnvironment === 'dogfood'
  || featureFlagDeploymentEnvironment === 'staging';

const aiBackgroundToolSandboxEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_BACKGROUND_TOOL_SANDBOX_ENABLED,
);

const aiBackgroundMemorySessionWriteQuotaEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_BACKGROUND_MEMORY_SESSION_WRITE_QUOTA_ENABLED,
);

const aiToolCallExecutorAutoRetryEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_TOOL_CALL_EXECUTOR_AUTO_RETRY_ENABLED,
);

const aiMcpServerEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_MCP_SERVER_ENABLED,
);

export const featureFlags = {
  aiChatEnabled: true,
  voiceAgentEnabled: true,
  /** 单主轴模式：所有时间编辑统一作用于 unit 主轴 | Single-axis mode: all timing edits target the unit axis */
  singleAxisUnitMode: true,
  /** AI 聊天灰度模式开关 | AI chat gray mode toggle */
  aiChatGrayMode: false,
  /** AI 聊天回滚模式开关 | AI chat rollback mode toggle */
  aiChatRollbackMode: false,
  /** AI 多步推理循环开关 | AI multi-step agent loop toggle */
  aiChatAgentLoopEnabled: true,
  /** 转写 AI 是否在构造 system 上下文前做 RAG 检索 | Whether transcription AI runs embedding RAG before system context */
  aiChatRagEnabled: true,
  /** C 阶段：记录 memory/RAG 召回形态证据 | C-stage: emit memory/RAG recall shape evidence */
  aiMemoryRecallShapeTelemetryEnabled: true,
  /** C 阶段：统一记忆召回 broker（dogfood 已启用）| C-stage unified memory broker (dogfood enabled) */
  aiMemoryBrokerEnabled: true,
  /** C 阶段：意图多候选与置信门控（dogfood 已启用）| C-stage intent confidence gate (dogfood enabled) */
  aiIntentConfidenceGateEnabled: true,
  /** C 阶段：后台任务工具沙箱（默认关闭；当前接入后台记忆抽取路径）| C-stage background task sandbox (off by default; wired for background memory extraction) */
  aiBackgroundToolSandboxEnabled: aiBackgroundToolSandboxEnabledFromEnv ?? aiBackgroundToolSandboxEnabledDefault,
  /** C 阶段：后台记忆抽取（dogfood 已启用）| C-stage background memory extractor (dogfood enabled) */
  aiBackgroundMemoryExtractorEnabled: true,
  /** T2-c：每会话（每 conversationId，内存计数）后台记忆 flush 成功写入次数上限；默认关闭 | Per-conversation in-memory cap on successful background memory write flushes */
  aiBackgroundMemorySessionWriteQuotaEnabled:
    aiBackgroundMemorySessionWriteQuotaEnabledFromEnv ?? aiBackgroundMemorySessionWriteQuotaEnabledDefault,
  /** 与 aiBackgroundMemorySessionWriteQuotaEnabled 配套；<=0 视为不启用 | Max successful write flushes per conversation when quota flag is on */
  aiBackgroundMemorySessionWriteQuotaMax: 12,
  /** C 阶段：扩展信任、配额与健康度治理（dogfood 已启用）| C-stage extension trust governance (dogfood enabled) */
  aiExtensionTrustGovernanceEnabled: true,
  /** C 阶段：语音 provider manifest（dogfood 已启用）| C-stage voice provider manifest (dogfood enabled) */
  aiVoiceProviderManifestEnabled: true,
  /** C 阶段：轻量协调协议（dogfood 已启用，audit-only）| C-stage coordination lite (dogfood enabled, audit-only) */
  aiCoordinationLiteEnabled: true,
  /**
   * T4-c：人工确认单工具执行路径，对 **执行器抛错/超时** 允许 **一次** 重试（不重试 `ok:false`；不覆盖破坏性工具）。
   * T4-c: human-confirmed single-tool path may **once** retry **executor throws/timeouts** (not `ok:false`; never destructive tools).
   */
  aiToolCallExecutorAutoRetryEnabled:
    aiToolCallExecutorAutoRetryEnabledFromEnv ?? aiToolCallExecutorAutoRetryEnabledDefault,
  /** 语料库实验室壳开关 | Corpus library lab shell toggle */
  corpusLibraryLabEnabled: false,
  /** P1b: MCP Server 只读工具开关（默认关闭；staging/dogfood 可手动开启） */
  aiMcpServerEnabled: aiMcpServerEnabledFromEnv ?? false,
} as const;

export type FeatureFlags = typeof featureFlags;
