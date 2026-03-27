
// 系统功能开关 | System feature flags
export const featureFlags = {
  aiChatEnabled: true,
  voiceAgentEnabled: true,
  /** 单主轴模式：所有时间编辑统一作用于 utterance 主轴 | Single-axis mode: all timing edits target the utterance axis */
  singleAxisUtteranceMode: true,
  /** LayerUnit 收口灰度：关闭后停止 legacy segmentation 新增/更新镜像写入，但仍保留删除清理 | LayerUnit convergence gray mode: when disabled, stop legacy segmentation insert/update mirror writes while keeping delete cleanup */
  legacySegmentationMirrorWriteEnabled: false,
  /** LayerUnit 收口灰度：关闭后 merged segmentation 查询不再回退 legacy 表 | LayerUnit convergence gray mode: when disabled, merged segmentation reads stop falling back to legacy tables */
  legacySegmentationReadFallbackEnabled: false,
  /** AI 聊天灰度模式开关 | AI chat gray mode toggle */
  aiChatGrayMode: false,
  /** AI 聊天回滚模式开关 | AI chat rollback mode toggle */
  aiChatRollbackMode: false,
} as const;

export type FeatureFlags = typeof featureFlags;
