// 系统功能开关 | System feature flags
type FeatureFlagDeploymentEnvironment = 'local' | 'dogfood' | 'staging' | 'prod';

function normalizeFeatureFlagDeploymentEnvironment(
  rawValue: string | undefined,
): FeatureFlagDeploymentEnvironment {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized) return import.meta.env.DEV ? 'local' : 'prod';
  if (normalized === 'development' || normalized === 'dev' || normalized === 'local')
    return 'local';
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

const aiBackgroundToolSandboxEnabledDefault =
  featureFlagDeploymentEnvironment === 'dogfood' || featureFlagDeploymentEnvironment === 'staging';

const aiBackgroundMemorySessionWriteQuotaEnabledDefault =
  featureFlagDeploymentEnvironment === 'dogfood' || featureFlagDeploymentEnvironment === 'staging';

const aiToolCallExecutorAutoRetryEnabledDefault =
  featureFlagDeploymentEnvironment === 'dogfood' || featureFlagDeploymentEnvironment === 'staging';

const aiBackgroundToolSandboxEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_BACKGROUND_TOOL_SANDBOX_ENABLED,
);

const aiBackgroundMemorySessionWriteQuotaEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_BACKGROUND_MEMORY_SESSION_WRITE_QUOTA_ENABLED,
);

const aiToolCallExecutorAutoRetryEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_TOOL_CALL_EXECUTOR_AUTO_RETRY_ENABLED,
);

const aiConversationManagementFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_CONVERSATION_MANAGEMENT_ENABLED,
);

const collaborationCloudEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_COLLABORATION_CLOUD_ENABLED,
);

const aiAgentLoopToolResultQualityGateEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_AGENT_LOOP_TOOL_RESULT_QUALITY_GATE_ENABLED,
);

const aiAgentLoopClosedLoopReplanningEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_AGENT_LOOP_CLOSED_LOOP_REPLANNING_ENABLED,
);

const aiAgentLoopContextBudgetRecalculationEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_AGENT_LOOP_CONTEXT_BUDGET_RECALCULATION_ENABLED,
);

const aiToolWriteGateEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_TOOL_WRITE_GATE_ENABLED,
);

const aiAgentLoopToolResultCompactionEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_AGENT_LOOP_TOOL_RESULT_COMPACTION_ENABLED,
);

const aiAgentLoopEffortScalingEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_AGENT_LOOP_EFFORT_SCALING_ENABLED,
);

const aiAgentUiPreviewEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_AGENT_UI_PREVIEW_ENABLED,
);

const aiSemanticGuardEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_SEMANTIC_GUARD_ENABLED,
);

const aiExternalMcpTrustEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_EXTERNAL_MCP_TRUST_ENABLED,
);

const aiMcpResourcesArtifactsEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_MCP_RESOURCES_ARTIFACTS_ENABLED,
);

const aiExternalMcpHttpClientEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_EXTERNAL_MCP_HTTP_CLIENT_ENABLED,
);

const aiExternalMcpSendTurnEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_EXTERNAL_MCP_SEND_TURN_ENABLED,
);

const aiExternalMcpProviderAdaptersEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_AI_EXTERNAL_MCP_PROVIDER_ADAPTERS_ENABLED,
);

const annotationPageEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_ANNOTATION_PAGE_ENABLED,
);
const corpusLibraryPageEnabledFromEnv = readOptionalBooleanFlag(
  import.meta.env.VITE_CORPUS_LIBRARY_PAGE_ENABLED,
);

const aiAgentLoopReliabilityFlagsDefaultEnabled =
  featureFlagDeploymentEnvironment === 'dogfood' ||
  featureFlagDeploymentEnvironment === 'staging' ||
  featureFlagDeploymentEnvironment === 'prod';

const aiToolWriteGateDefaultEnabled =
  featureFlagDeploymentEnvironment === 'dogfood' || featureFlagDeploymentEnvironment === 'staging';

export const featureFlags = {
  aiChatEnabled: true,
  voiceAgentEnabled: true,
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
  aiBackgroundToolSandboxEnabled:
    aiBackgroundToolSandboxEnabledFromEnv ?? aiBackgroundToolSandboxEnabledDefault,
  /** C 阶段：后台记忆抽取（dogfood 已启用）| C-stage background memory extractor (dogfood enabled) */
  aiBackgroundMemoryExtractorEnabled: true,
  /** T2-c：每会话（每 conversationId，内存计数）后台记忆 flush 成功写入次数上限；默认关闭 | Per-conversation in-memory cap on successful background memory write flushes */
  aiBackgroundMemorySessionWriteQuotaEnabled:
    aiBackgroundMemorySessionWriteQuotaEnabledFromEnv ??
    aiBackgroundMemorySessionWriteQuotaEnabledDefault,
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
  /** G1 多会话目录 + clearCurrent / startNew（PR-6 起默认开启；可用 env 覆盖） */
  aiConversationManagement: aiConversationManagementFromEnv ?? true,
  /**
   * 协作云同步总开关（Realtime / outbound queue / presence / 云端目录）。
   * 默认 true 保持现网行为；设为 false 可全局关闭协同写路径与 bridge 订阅。
   */
  collaborationCloudEnabled: collaborationCloudEnabledFromEnv ?? true,
  /**
   * Agent loop verify 步（Result Quality Gate）：在 continuation payload 中附带工具结果质量标注
   * （empty_result / search_no_results / tool_failed），让模型不基于空证据收敛或编造。
   * 默认 false，关闭时 continuation 输出与现网逐字节一致；见 spec ai-agent-loop-reliability-improvements §2.2。
   */
  aiAgentLoopToolResultQualityGateEnabled:
    aiAgentLoopToolResultQualityGateEnabledFromEnv ?? aiAgentLoopReliabilityFlagsDefaultEnabled,
  /**
   * Agent loop 闭环重规划（P0）：工具结果后 evaluateReplanningNeed，纠正 queryFamily 误判 /
   * 搜索 0 条早停 / detail 不存在改走 search。默认 false；见 spec ai-agent-loop-reliability §2.1。
   */
  aiAgentLoopClosedLoopReplanningEnabled:
    aiAgentLoopClosedLoopReplanningEnabledFromEnv ?? aiAgentLoopReliabilityFlagsDefaultEnabled,
  /**
   * Agent loop 每步按剩余步数动态收缩 history char 预算（spec §2.3）。默认 false。
   */
  aiAgentLoopContextBudgetRecalculationEnabled:
    aiAgentLoopContextBudgetRecalculationEnabledFromEnv ??
    aiAgentLoopReliabilityFlagsDefaultEnabled,
  /**
   * A7 Last Mile write gate: readonly local tools auto-allow; write tools scope-checked at executor.
   * 默认 false；dogfood/staging 可经 env 开启。见 spec agent-runtime-security-write-gate。
   */
  aiToolWriteGateEnabled: aiToolWriteGateEnabledFromEnv ?? aiToolWriteGateDefaultEnabled,
  /**
   * Agent loop 历史中的旧 tool result / 长 assistant 回合压缩（P1 compaction）。默认与可靠性 flags 同环境矩阵。
   */
  aiAgentLoopToolResultCompactionEnabled:
    aiAgentLoopToolResultCompactionEnabledFromEnv ?? aiAgentLoopReliabilityFlagsDefaultEnabled,
  /**
   * A4b: scale agent-loop maxSteps by queryFamily (count=2, search/detail=4, else base).
   * 默认 false；开启后才改变步数。见 spec agent-runtime-runner-foundation §5。
   */
  aiAgentLoopEffortScalingEnabled: aiAgentLoopEffortScalingEnabledFromEnv ?? false,
  /**
   * A11: AgentUiEvent write preview + triage in AlertsPanel.
   * 默认 false；开启后 pending/blocked/confirm 发同源事件并渲染结构化 preview。
   */
  aiAgentUiPreviewEnabled: aiAgentUiPreviewEnabledFromEnv ?? false,
  /**
   * A9: local inbound injection block + outbound PII/secret redact.
   * 默认 false；开启后挂 before_model / before_client。见 spec agent-runtime-security-semantic-guard。
   */
  aiSemanticGuardEnabled: aiSemanticGuardEnabledFromEnv ?? false,
  /**
   * B11: outbound MCP origin allowlist. Default false; untrusted schema never reaches the LLM.
   */
  aiExternalMcpTrustEnabled: aiExternalMcpTrustEnabledFromEnv ?? false,
  /**
   * B12: inbound MCP resources/prompts + AgentArtifactV0 persist.
   * Default false; flag off keeps resources/prompts as Method not found.
   */
  aiMcpResourcesArtifactsEnabled: aiMcpResourcesArtifactsEnabledFromEnv ?? false,
  /**
   * B13: outbound Streamable HTTP MCP client. Default false; no fetch unless B11 origin is enabled.
   */
  aiExternalMcpHttpClientEnabled: aiExternalMcpHttpClientEnabledFromEnv ?? false,
  /**
   * B14: inject cached external MCP tools into send-turn prompt and execute `extmcp__` tool_call JSON.
   * Default false; no guide and no outbound execute unless this flag is on.
   */
  aiExternalMcpSendTurnEnabled: aiExternalMcpSendTurnEnabledFromEnv ?? false,
  /**
   * B15: Zotero / OpenAlex MCP provider adapters (Settings presets + EvidencePacket mapping).
   * Default false. Depends on B13/B14; does not call OpenAlex REST or Zotero :23119.
   */
  aiExternalMcpProviderAdaptersEnabled: aiExternalMcpProviderAdaptersEnabledFromEnv ?? false,
  /**
   * B4a-1: annotation workspace readonly IGT shell + keyboard skeleton.
   * Default false; flag off keeps FeatureAvailabilityPanel.
   */
  annotationPageEnabled: annotationPageEnabledFromEnv ?? false,
  /**
   * B5a-1: corpus library readonly list + isolated workset shell.
   * Owner: corpus. Default false; flag off keeps FeatureAvailabilityPanel.
   * Expiry: revisit after B5b dogfood (do not default true in this slice).
   */
  corpusLibraryPageEnabled: corpusLibraryPageEnabledFromEnv ?? false,
} as const;
