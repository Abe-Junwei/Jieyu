/**
 * i18n 消息统一出口 | Unified i18n message barrel
 *
 * 目的 | Purpose
 * - 统一业务侧对 message module 的导入入口，避免分散直连。
 * - 为后续逐步迁移到 DICT_KEYS/tf 提供单一治理边界。
 */

export * from './aiChatCandidateChipsMessages';
export * from './aiChatCardMessages';
export * from './aiChatCardUtilityMessages';
export * from './aiChatHybridMessages';
export * from './aiChatMetricsBarMessages';
export * from './aiChatPromptLabMessages';
export * from './aiChatReplayDetailPanelMessages';
export * from './aiChatReplayUtilsMessages';
export * from './aiEmbeddingCardMessages';
export * from './aiEmbeddingStateMessages';
export * from './appDataResilienceMessages';
export * from './batchOperationPanelMessages';
export * from './collaborationCloudPanelMessages';
export * from './collaborationConflictReviewDrawerMessages';
export * from './collaborationSyncSurfaceMessages';
export * from './confirmDeleteDialogMessages';
export * from './devErrorAggregationPanelMessages';
export * from './languageInputMessages';
export * from './layerActionPopoverMessages';
export * from './layerConstraintServiceMessages';
export * from './layerStyleSubmenuMessages';
export * from './noteHandlersMessages';
export * from './notePanelMessages';
export * from './orthographyBridgeManagerMessages';
export * from './orthographyBuilderMessages';
export * from './pdfPreviewSectionMessages';
export * from './pdfViewerPanelMessages';
export * from './projectSetupDialogMessages';
export * from './reportGeneratorMessages';
export * from './searchReplaceOverlayMessages';
export * from './settingsModalMessages';
export * from './shortcutsPanelMessages';
export * from './sidePaneSidebarMessages';
export * from './timelineLaneHeaderMessages';
export * from './timelineParityMatrixMessages';
export * from './transcriptionOverlaysMessages';
export * from './voiceInteractionMessages';
