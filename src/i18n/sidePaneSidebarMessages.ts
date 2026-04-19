import type { Locale } from './index';

export type SidePaneSidebarMessages = {
  constraintIndependent: string;
  constraintTimeSubdivision: string;
  constraintSymbolicAssociation: string;
  contextCreateTranscription: string;
  contextCreateTranslation: string;
  contextDeleteCurrentLayer: string;
  speakerManagementTitle: string;
  speakerEntityCount: (count: number) => string;
  speakerReferencedInScope: (count: number) => string;
  speakerReferencedProject: (count: number) => string;
  speakerReferencedProjectPending: string;
  /** Whether `getSpeakerReferenceStats` used current timeline media id vs whole project. */
  speakerStatsScopeLabel: (scopedToCurrentMedia: boolean) => string;
  /** Rows with no speakerId in the same stats scope (informational). */
  speakerUnassignedAxisStats: (transcriptionUnitCount: number, segmentCount: number) => string;
  speakerUnusedCount: (count: number) => string;
  speakerUnusedCountPending: string;
  speakerDuplicateGroupCount: (count: number) => string;
  speakerSelectedUnitCount: (count: number) => string;
  speakerCleanupUnusedTitle: string;
  speakerCleanupUnusedButton: (count: number) => string;
  speakerBatchAssignTitle: string;
  speakerTargetPlaceholder: string;
  speakerApplyButton: string;
  speakerClearTitle: string;
  speakerClearButton: string;
  speakerDraftPlaceholder: string;
  speakerCreateOnlyTitle: string;
  speakerCreateOnlyButton: string;
  speakerCreateAssignTitle: string;
  speakerCreateAssignButton: string;
  speakerFilterAria: string;
  speakerFilterAllTitle: string;
  speakerFilterAllLabel: string;
  speakerGroupAria: string;
  speakerGroupExpand: string;
  speakerGroupCollapse: string;
  speakerFocusTitle: string;
  speakerFocusButton: string;
  speakerSelectAllTitle: string;
  speakerSelectAllButton: string;
  speakerDeleteTagTitle: string;
  speakerDeleteTagButton: string;
  speakerExportTitle: string;
  speakerExportButton: string;
  speakerRenameTitle: string;
  speakerRenameButton: string;
  speakerMergeTitle: string;
  speakerMergeButton: string;
  speakerDeleteEntityTitle: string;
  speakerDeleteEntityButton: string;
  speakerCurrentScopeCount: (count: number) => string;
  speakerCurrentScopeNone: string;
  speakerProjectRefCount: (count: number) => string;
  speakerProjectRefPending: string;
  /** Transcription-axis (`units`) vs layer segment counts from `LinguisticService.getSpeakerReferenceStats`. */
  speakerAxisStats: (transcriptionUnitCount: number, segmentCount: number) => string;
  speakerAxisStatsPending: string;
  speakerUnusedEntityHint: string;
  speakerDuplicateEntityHint: (count: number) => string;
  draggableLayerRoleDesc: string;
  layerTypeTranslationShort: string;
  layerTypeTranscriptionShort: string;
  layerHeaderVarietyFallback: string;
  layerHeaderOrthographyFallback: string;
  emptyLayerHint: string;
  inspectorAria: string;
  inspectorEmpty: string;
  inspectorDeleteCurrentLayerTitle: string;
  inspectorDeleteCurrentLayerAria: string;
  inspectorLanguage: string;
  inspectorConstraint: string;
  inspectorAlias: string;
  inspectorOrthography: string;
  inspectorParentLayer: string;
  inspectorParentLayerAria: string;
  inspectorSelectPlaceholder: string;
  inspectorNoIndependentLayer: string;
  overviewLayerListAria: string;
  overviewLayerListTitle: string;
  quickActionsAria: string;
  quickActionCreateTranscription: string;
  quickActionCreateTranslation: string;
  quickActionMore: string;
  quickActionMoreAria: string;
  quickActionSpeakerManagement: string;
  quickActionDeleteCurrentLayer: string;
  quickActionRepairing: string;
  quickActionRepair: string;
  deleteLayerModalAria: string;
  deleteKeepUnits: string;
  deleteButton: string;
  cancelButton: string;
  closeButton: string;
  repairDetailsAria: string;
  repairDetailsTitle: string;
  repairDetailsExpandAria: string;
  repairDetailsCollapseAria: string;
  repairDetailsExpand: string;
  repairDetailsCollapse: string;
  quickActionsCardAria: string;
  quickActionsCardTitle: string;
  presenceCardAria: string;
  presenceCardTitle: string;
  presenceEmpty: string;
  presenceSelfSuffix: string;
  presenceStateLabel: (state: 'online' | 'idle' | 'offline') => string;
  presenceEntityLabel: (entityType: string) => string;
  presenceFocusLabel: (entityLabel: string, entityId: string) => string;
  layerCreateStripAria: string;
  inlinePaneAria: string;
  paneTitle: string;
  paneSubtitle: string;
  segmentListAria: string;
  segmentListTitle: string;
  segmentListSubtitle: string;
  segmentListLoading: string;
  segmentListNoSegments: string;
  segmentListNoMatches: string;
  segmentListEmpty: string;
  segmentListFilterPlaceholder: string;
  segmentListFilterButton: string;
  segmentListFilterOptionSearchPlaceholder: string;
  segmentListFilterNoOptions: string;
  segmentListContentFilterLabel: string;
  segmentListSpeakerFilterLabel: string;
  segmentListNoteCategoryFilterLabel: string;
  segmentListCertaintyFilterLabel: string;
  segmentListAnnotationStatusFilterLabel: string;
  segmentListSourceTypeFilterLabel: string;
  segmentListReviewPresetAll: string;
  segmentListReviewPresetTime: string;
  segmentListReviewPresetContentConcern: string;
  segmentListReviewPresetContentMissing: string;
  segmentListReviewPresetManualAttention: string;
  segmentListReviewPresetPendingReview: string;
  segmentListReviewPrev: string;
  segmentListReviewNext: string;
  segmentListSpeakerPending: string;
  segmentListFilterReset: string;
  segmentListContentStateHasText: string;
  segmentListContentStateEmptyText: string;
  segmentListAnnotationStatusRaw: string;
  segmentListAnnotationStatusTranscribed: string;
  segmentListAnnotationStatusTranslated: string;
  segmentListAnnotationStatusGlossed: string;
  segmentListAnnotationStatusVerified: string;
  segmentListSourceTypeHuman: string;
  segmentListSourceTypeAi: string;
  segmentListCertaintyNotUnderstood: string;
  segmentListCertaintyUncertain: string;
  segmentListCertaintyCertain: string;
  segmentListNoteCategoryComment: string;
  segmentListNoteCategoryQuestion: string;
  segmentListNoteCategoryTodo: string;
  segmentListNoteCategoryLinguistic: string;
  segmentListNoteCategoryFieldwork: string;
  segmentListNoteCategoryCorrection: string;
  segmentListTimeRange: (start: string, end: string) => string;
  repairNoNeed: string;
  repairFailedPrefix: string;
  repairSummary: (changedLayers: number, changedSortLayers: number, remaining: number) => string;
  repairSummaryDone: (changedLayers: number, changedSortLayers: number) => string;
};

const zhCN: SidePaneSidebarMessages = {
  constraintIndependent: '\u72ec\u7acb\u8fb9\u754c',
  constraintTimeSubdivision: '\u65f6\u95f4\u7ec6\u5206',
  constraintSymbolicAssociation: '\u7b26\u53f7\u5173\u8054',
  contextCreateTranscription: '\u65b0\u5efa\u8f6c\u5199\u5c42',
  contextCreateTranslation: '\u65b0\u5efa\u7ffb\u8bd1\u5c42',
  contextDeleteCurrentLayer: '\u5220\u9664\u5f53\u524d\u5c42',
  speakerManagementTitle: '\u8bf4\u8bdd\u4eba\u7ba1\u7406',
  speakerEntityCount: (count) => `\u8bf4\u8bdd\u4eba\u5b9e\u4f53\uff1a${count}`,
  speakerReferencedInScope: (count) => `\u5f53\u524d\u8303\u56f4\u5df2\u5f15\u7528\uff1a${count}`,
  speakerReferencedProject: (count) => `\u7edf\u8ba1\u8303\u56f4\u5185\u5df2\u5f15\u7528\u8bf4\u8bdd\u4eba\uff1a${count}`,
  speakerReferencedProjectPending: '\u7edf\u8ba1\u8303\u56f4\u5185\u5df2\u5f15\u7528\u8bf4\u8bdd\u4eba\uff1a\u7edf\u8ba1\u4e2d\u2026',
  speakerStatsScopeLabel: (scopedToCurrentMedia) => (scopedToCurrentMedia ? '\u8303\u56f4\uff1a\u5f53\u524d\u5a92\u4f53' : '\u8303\u56f4\uff1a\u5168\u9879\u76ee'),
  speakerUnassignedAxisStats: (transcriptionUnitCount, segmentCount) => `\u672a\u6307\u5b9a\u8bf4\u8bdd\u4eba \u00b7 \u8f6c\u5199\u8bed\u6bb5\uff1a${transcriptionUnitCount} / \u5c42\u7247\u6bb5\uff1a${segmentCount}`,
  speakerUnusedCount: (count) => `\u672a\u5f15\u7528\u5b9e\u4f53\uff1a${count}`,
  speakerUnusedCountPending: '\u672a\u5f15\u7528\u5b9e\u4f53\uff1a\u7edf\u8ba1\u4e2d\u2026',
  speakerDuplicateGroupCount: (count) => `\u540c\u540d\u7ec4\uff1a${count}`,
  speakerSelectedUnitCount: (count) => `\u5df2\u9009\u53e5\u6bb5\uff1a${count}`,
  speakerCleanupUnusedTitle: '\u6279\u91cf\u5220\u9664\u5168\u9879\u76ee\u672a\u5f15\u7528\u7684\u8bf4\u8bdd\u4eba\u5b9e\u4f53',
  speakerCleanupUnusedButton: (count) => `\u6e05\u7406\u672a\u5f15\u7528\u5b9e\u4f53\uff08${count}\uff09`,
  speakerBatchAssignTitle: '\u6279\u91cf\u5206\u914d',
  speakerTargetPlaceholder: '\u9009\u62e9\u76ee\u6807\u8bf4\u8bdd\u4eba',
  speakerApplyButton: '\u5e94\u7528\u8bf4\u8bdd\u4eba',
  speakerClearTitle: '\u6e05\u7a7a\u5f53\u524d\u9009\u4e2d\u8bed\u6bb5\u7684\u8bf4\u8bdd\u4eba\u6807\u7b7e',
  speakerClearButton: '\u6e05\u7a7a\u5df2\u9009\u8bf4\u8bdd\u4eba',
  speakerDraftPlaceholder: '\u65b0\u8bf4\u8bdd\u4eba\u540d\u79f0',
  speakerCreateOnlyTitle: '\u4ec5\u65b0\u5efa\u8bf4\u8bdd\u4eba\uff0c\u4e0d\u5206\u914d\u53e5\u6bb5',
  speakerCreateOnlyButton: '\u4ec5\u65b0\u5efa',
  speakerCreateAssignTitle: '\u65b0\u5efa\u8bf4\u8bdd\u4eba\u5e76\u5206\u914d\u5230\u5df2\u9009\u53e5\u6bb5',
  speakerCreateAssignButton: '\u65b0\u5efa\u5e76\u5206\u914d',
  speakerFilterAria: '\u6309\u8bf4\u8bdd\u4eba\u7b5b\u9009',
  speakerFilterAllTitle: '\u663e\u793a\u5168\u90e8\u8bf4\u8bdd\u4eba',
  speakerFilterAllLabel: '\u5168\u90e8',
  speakerGroupAria: '\u8bf4\u8bdd\u4eba\u7ec4',
  speakerGroupExpand: '\u5c55\u5f00\u8bf4\u8bdd\u4eba\u7ec4',
  speakerGroupCollapse: '\u6298\u53e0\u8bf4\u8bdd\u4eba\u7ec4',
  speakerFocusTitle: '\u53ea\u770b\u8be5\u8bf4\u8bdd\u4eba',
  speakerFocusButton: '\u805a\u7126',
  speakerSelectAllTitle: '\u9009\u4e2d\u8be5\u8bf4\u8bdd\u4eba\u7684\u5168\u90e8\u53e5\u6bb5',
  speakerSelectAllButton: '\u9009\u4e2d',
  speakerDeleteTagTitle: '\u5220\u9664\u8be5\u8bf4\u8bdd\u4eba\u7684\u6807\u7b7e',
  speakerDeleteTagButton: '\u5220\u9664\u6807\u7b7e',
  speakerExportTitle: '\u5bfc\u51fa\u8be5\u8bf4\u8bdd\u4eba\u53e5\u6bb5\u6e05\u5355',
  speakerExportButton: '\u5bfc\u51fa',
  speakerRenameTitle: '\u91cd\u547d\u540d\u8be5\u8bf4\u8bdd\u4eba',
  speakerRenameButton: '\u6539\u540d',
  speakerMergeTitle: '\u5c06\u8be5\u8bf4\u8bdd\u4eba\u5408\u5e76\u5230\u5176\u4ed6\u8bf4\u8bdd\u4eba',
  speakerMergeButton: '\u5408\u5e76',
  speakerDeleteEntityTitle: '\u5220\u9664\u8be5\u8bf4\u8bdd\u4eba\u5b9e\u4f53\uff08\u5371\u9669\uff09',
  speakerDeleteEntityButton: '\u5220\u9664\u8bf4\u8bdd\u4eba\u5b9e\u4f53',
  speakerCurrentScopeCount: (count) => `\u5f53\u524d\u8303\u56f4\u53e5\u6bb5\u6570\uff1a${count}`,
  speakerCurrentScopeNone: '\u5f53\u524d\u8303\u56f4\u672a\u5f15\u7528',
  speakerProjectRefCount: (count) => `\u7edf\u8ba1\u8303\u56f4\u5185\u5f15\u7528\uff1a${count}`,
  speakerProjectRefPending: '\u7edf\u8ba1\u8303\u56f4\u5185\u5f15\u7528\uff1a\u7edf\u8ba1\u4e2d\u2026',
  speakerAxisStats: (transcriptionUnitCount, segmentCount) => `\u8f6c\u5199\u8bed\u6bb5\uff1a${transcriptionUnitCount} / \u5c42\u7247\u6bb5\uff1a${segmentCount}`,
  speakerAxisStatsPending: '\u8f6c\u5199\u8bed\u6bb5 / \u5c42\u7247\u6bb5\uff1a\u7edf\u8ba1\u4e2d\u2026',
  speakerUnusedEntityHint: '\u8be5\u5b9e\u4f53\u5f53\u524d\u672a\u88ab\u5f15\u7528\uff0c\u53ef\u5b89\u5168\u6e05\u7406',
  speakerDuplicateEntityHint: (count) => `\u68c0\u6d4b\u5230\u540c\u540d\u5b9e\u4f53\u7ec4\uff1a${count} \u4e2a\uff0c\u5efa\u8bae\u5408\u5e76\u6e05\u7406`,
  draggableLayerRoleDesc: '\u53ef\u62d6\u62fd\u5c42',
  layerTypeTranslationShort: '\u8bd1',
  layerTypeTranscriptionShort: '\u5199',
  layerHeaderVarietyFallback: '\u672a\u8bbe\u7f6e\u65b9\u8a00\u6216\u522b\u540d',
  layerHeaderOrthographyFallback: '\u672a\u8bbe\u7f6e\u6b63\u5b57\u6cd5',
  emptyLayerHint: '\u6682\u65e0\u5c42\uff0c\u8bf7\u5728\u5de6\u4fa7\u680f\u4e2d\u90e8\u9884\u7559\u533a\u70b9\u300c\u65b0\u5efa\u8f6c\u5199\u5c42\u300d',
  inspectorAria: '\u5f53\u524d\u5c42\u8be6\u60c5',
  inspectorEmpty: '\u8bf7\u9009\u62e9\u4e00\u4e2a\u5c42\u67e5\u770b\u8be6\u60c5\u3002',
  inspectorDeleteCurrentLayerTitle: '\u5220\u9664\u5f53\u524d\u5c42',
  inspectorDeleteCurrentLayerAria: '\u5220\u9664\u5f53\u524d\u5c42',
  inspectorLanguage: '\u8bed\u8a00',
  inspectorConstraint: '\u7ea6\u675f',
  inspectorAlias: '\u522b\u540d',
  inspectorOrthography: '\u6b63\u5b57\u6cd5',
  inspectorParentLayer: '\u4f9d\u8d56\u8f6c\u5199\u5c42',
  inspectorParentLayerAria: '\u4f9d\u8d56\u8f6c\u5199\u5c42',
  inspectorSelectPlaceholder: '\u8bf7\u9009\u62e9',
  inspectorNoIndependentLayer: '\u6682\u65e0\u53ef\u7528\u7684\u72ec\u7acb\u8f6c\u5199\u5c42\u53ef\u4f9b\u7ed1\u5b9a\u3002',
  overviewLayerListAria: '\u5c42\u5217\u8868',
  overviewLayerListTitle: '\u5c42\u5217\u8868',
  quickActionsAria: '\u5c42\u7ba1\u7406\u5feb\u6377\u64cd\u4f5c',
  quickActionCreateTranscription: '\u65b0\u5efa\u8f6c\u5199\u5c42',
  quickActionCreateTranslation: '\u65b0\u5efa\u7ffb\u8bd1\u5c42',
  quickActionMore: '\u66f4\u591a',
  quickActionMoreAria: '\u66f4\u591a\u64cd\u4f5c',
  quickActionSpeakerManagement: '\u8bf4\u8bdd\u4eba\u7ba1\u7406',
  quickActionDeleteCurrentLayer: '\u5220\u9664\u5f53\u524d\u5c42',
  quickActionRepairing: '\u4fee\u590d\u4e2d\u2026',
  quickActionRepair: '\u7ea6\u675f\u4fee\u590d',
  deleteLayerModalAria: '\u5220\u9664\u5c42',
  deleteKeepUnits: '\u4fdd\u7559\u73b0\u6709\u8bed\u6bb5\u533a\u95f4',
  deleteButton: '\u5220\u9664',
  cancelButton: '\u53d6\u6d88',
  closeButton: '\u5173\u95ed',
  repairDetailsAria: '\u7ea6\u675f\u4fee\u590d\u660e\u7ec6',
  repairDetailsTitle: '\u4fee\u590d\u660e\u7ec6',
  repairDetailsExpandAria: '\u5c55\u5f00\u4fee\u590d\u660e\u7ec6',
  repairDetailsCollapseAria: '\u6536\u8d77\u4fee\u590d\u660e\u7ec6',
  repairDetailsExpand: '\u5c55\u5f00\u660e\u7ec6',
  repairDetailsCollapse: '\u6536\u8d77\u660e\u7ec6',
  quickActionsCardAria: '\u5c42\u7ba1\u7406\u5feb\u6377\u64cd\u4f5c\u5361\u7247',
  quickActionsCardTitle: '\u5c42\u7ba1\u7406\u5feb\u6377\u64cd\u4f5c',
  presenceCardAria: '在线协作成员',
  presenceCardTitle: '在线协作',
  presenceEmpty: '当前暂无在线成员',
  presenceSelfSuffix: '（你）',
  presenceStateLabel: (state) => {
    if (state === 'idle') return '暂离';
    if (state === 'offline') return '离线';
    return '在线';
  },
  presenceEntityLabel: (entityType) => {
    if (entityType === 'layer') return '层';
    if (entityType === 'layer_unit') return '语段';
    if (entityType === 'layer_unit_content') return '语段内容';
    if (entityType === 'unit_relation') return '层关系';
    if (entityType === 'asset') return '资产';
    if (entityType === 'snapshot') return '快照';
    if (entityType === 'comment') return '备注';
    return '实体';
  },
  presenceFocusLabel: (entityLabel, entityId) => `聚焦：${entityLabel} #${entityId}`,
  layerCreateStripAria: '\u65b0\u5efa\u8f6c\u5199\u4e0e\u7ffb\u8bd1\u5c42',
  inlinePaneAria: '\u6587\u672c\u533a\u5c42\u6eda\u52a8\u680f',
  paneTitle: '\u6587\u672c\u5c42\u5de5\u4f5c\u53f0',
  paneSubtitle: '\u5c42\u5217\u8868\u3001\u5f53\u524d\u5c42\u8be6\u60c5\u4e0e\u5feb\u6377\u64cd\u4f5c',
  segmentListAria: '\u8bed\u6bb5\u5217\u8868',
  segmentListTitle: '\u8bed\u6bb5\u5217\u8868',
  segmentListSubtitle: '\u6309\u6587\u672c\u3001\u8bf4\u8bdd\u4eba\u4e0e\u6807\u6ce8\u72b6\u6001\u5feb\u901f\u5b9a\u4f4d',
  segmentListLoading: '\u6b63\u5728\u52a0\u8f7d\u8bed\u6bb5\u2026',
  segmentListNoSegments: '\u5f53\u524d\u5c42\u6682\u65e0\u8bed\u6bb5',
  segmentListNoMatches: '\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u65e0\u5339\u914d\u8bed\u6bb5',
  segmentListEmpty: '\u65e0\u5185\u5bb9',
  segmentListFilterPlaceholder: '\u68c0\u7d22\u8bed\u6bb5\u5185\u5bb9\u2026',
  segmentListFilterButton: '\u7b5b\u9009',
  segmentListFilterOptionSearchPlaceholder: '\u641c\u7d22\u7b5b\u9009\u9879\u2026',
  segmentListFilterNoOptions: '\u6ca1\u6709\u5339\u914d\u7684\u7b5b\u9009\u9879',
  segmentListContentFilterLabel: '\u6309\u5185\u5bb9\u72b6\u6001\u7b5b\u9009',
  segmentListSpeakerFilterLabel: '\u6309\u8bf4\u8bdd\u4eba\u7b5b\u9009',
  segmentListNoteCategoryFilterLabel: '\u6309\u5907\u6ce8\u5206\u7c7b\u7b5b\u9009',
  segmentListCertaintyFilterLabel: '\u6309\u786e\u4fe1\u5ea6\u7b5b\u9009',
  segmentListAnnotationStatusFilterLabel: '\u6309\u6807\u6ce8\u72b6\u6001\u7b5b\u9009',
  segmentListSourceTypeFilterLabel: '\u6309\u6765\u6e90\u7b5b\u9009',
  segmentListReviewPresetAll: '\u5168\u90e8\u95ee\u9898',
  segmentListReviewPresetTime: '\u65f6\u95f4\u5f02\u5e38',
  segmentListReviewPresetContentConcern: '\u5185\u5bb9\u5b58\u7591',
  segmentListReviewPresetContentMissing: '\u5185\u5bb9\u7f3a\u5931',
  segmentListReviewPresetManualAttention: '\u5f85\u4eba\u5de5\u5904\u7406',
  segmentListReviewPresetPendingReview: '\u5f85\u590d\u6838',
  segmentListReviewPrev: '\u4e0a\u4e00\u6761\u5f85\u590d\u6838',
  segmentListReviewNext: '\u4e0b\u4e00\u6761\u5f85\u590d\u6838',
  segmentListSpeakerPending: '\u5f85\u8865\u8bf4\u8bdd\u4eba',
  segmentListFilterReset: '\u6e05\u7a7a\u7b5b\u9009',
  segmentListContentStateHasText: '\u6709\u5185\u5bb9',
  segmentListContentStateEmptyText: '\u65e0\u5185\u5bb9',
  segmentListAnnotationStatusRaw: '\u539f\u59cb',
  segmentListAnnotationStatusTranscribed: '\u5df2\u8f6c\u5199',
  segmentListAnnotationStatusTranslated: '\u5df2\u7ffb\u8bd1',
  segmentListAnnotationStatusGlossed: '\u5df2\u8bcd\u6c47\u6807\u6ce8',
  segmentListAnnotationStatusVerified: '\u5df2\u6821\u9a8c',
  segmentListSourceTypeHuman: '\u4eba\u5de5',
  segmentListSourceTypeAi: 'AI',
  segmentListCertaintyNotUnderstood: '\u4e0d\u7406\u89e3',
  segmentListCertaintyUncertain: '\u4e0d\u786e\u5b9a',
  segmentListCertaintyCertain: '\u786e\u5b9a',
  segmentListNoteCategoryComment: '\u8bc4\u8bba',
  segmentListNoteCategoryQuestion: '\u95ee\u9898',
  segmentListNoteCategoryTodo: '\u5f85\u529e',
  segmentListNoteCategoryLinguistic: '\u8bed\u8a00\u5b66',
  segmentListNoteCategoryFieldwork: '\u7530\u91ce',
  segmentListNoteCategoryCorrection: '\u4fee\u8ba2',
  segmentListTimeRange: (start, end) => `${start} \u2013 ${end}`,
  repairNoNeed: '\u5c42\u7ea6\u675f\u68c0\u67e5\u901a\u8fc7\uff0c\u65e0\u9700\u4fee\u590d\u3002',
  repairFailedPrefix: '\u7ea6\u675f\u4fee\u590d\u5931\u8d25\uff1a',
  repairSummary: (changedLayers, changedSortLayers, remaining) => `\u5df2\u4fee\u590d ${changedLayers} \u6761\u7ed3\u6784\u7ea6\u675f\u3001${changedSortLayers} \u6761\u987a\u5e8f\u95ee\u9898\uff0c\u4ecd\u6709 ${remaining} \u6761\u9700\u4eba\u5de5\u5904\u7406\u3002`,
  repairSummaryDone: (changedLayers, changedSortLayers) => `\u5df2\u81ea\u52a8\u4fee\u590d ${changedLayers} \u6761\u7ed3\u6784\u7ea6\u675f\u3001${changedSortLayers} \u6761\u987a\u5e8f\u95ee\u9898\u3002`,
};

const enUS: SidePaneSidebarMessages = {
  constraintIndependent: 'Independent boundary',
  constraintTimeSubdivision: 'Time subdivision',
  constraintSymbolicAssociation: 'Symbolic association',
  contextCreateTranscription: 'Create transcription layer',
  contextCreateTranslation: 'Create translation layer',
  contextDeleteCurrentLayer: 'Delete current layer',
  speakerManagementTitle: 'Speaker management',
  speakerEntityCount: (count) => `Speaker entities: ${count}`,
  speakerReferencedInScope: (count) => `Referenced in current scope: ${count}`,
  speakerReferencedProject: (count) => `Speakers referenced in stats scope: ${count}`,
  speakerReferencedProjectPending: 'Speakers referenced in stats scope: counting\u2026',
  speakerStatsScopeLabel: (scopedToCurrentMedia) => (scopedToCurrentMedia ? 'Scope: current media' : 'Scope: whole project'),
  speakerUnassignedAxisStats: (transcriptionUnitCount, segmentCount) => `Unassigned · Transcription units: ${transcriptionUnitCount} / Layer segments: ${segmentCount}`,
  speakerUnusedCount: (count) => `Unused entities: ${count}`,
  speakerUnusedCountPending: 'Unused entities: counting\u2026',
  speakerDuplicateGroupCount: (count) => `Duplicate-name groups: ${count}`,
  speakerSelectedUnitCount: (count) => `Selected units: ${count}`,
  speakerCleanupUnusedTitle: 'Batch delete unused speaker entities across the project',
  speakerCleanupUnusedButton: (count) => `Clean unused entities (${count})`,
  speakerBatchAssignTitle: 'Batch assign',
  speakerTargetPlaceholder: 'Select target speaker',
  speakerApplyButton: 'Apply speaker',
  speakerClearTitle: 'Clear speaker tags on selected units',
  speakerClearButton: 'Clear selected speakers',
  speakerDraftPlaceholder: 'New speaker name',
  speakerCreateOnlyTitle: 'Create speaker only, do not assign units',
  speakerCreateOnlyButton: 'Create only',
  speakerCreateAssignTitle: 'Create speaker and assign to selected units',
  speakerCreateAssignButton: 'Create and assign',
  speakerFilterAria: 'Filter by speaker',
  speakerFilterAllTitle: 'Show all speakers',
  speakerFilterAllLabel: 'All',
  speakerGroupAria: 'Speaker groups',
  speakerGroupExpand: 'Expand speaker group',
  speakerGroupCollapse: 'Collapse speaker group',
  speakerFocusTitle: 'Focus this speaker only',
  speakerFocusButton: 'Focus',
  speakerSelectAllTitle: 'Select all units for this speaker',
  speakerSelectAllButton: 'Select',
  speakerDeleteTagTitle: 'Delete tags for this speaker',
  speakerDeleteTagButton: 'Delete tag',
  speakerExportTitle: 'Export segment list for this speaker',
  speakerExportButton: 'Export',
  speakerRenameTitle: 'Rename this speaker',
  speakerRenameButton: 'Rename',
  speakerMergeTitle: 'Merge this speaker into another one',
  speakerMergeButton: 'Merge',
  speakerDeleteEntityTitle: 'Delete this speaker entity (danger)',
  speakerDeleteEntityButton: 'Delete speaker entity',
  speakerCurrentScopeCount: (count) => `Segments in current scope: ${count}`,
  speakerCurrentScopeNone: 'Not referenced in current scope',
  speakerProjectRefCount: (count) => `In-scope references: ${count}`,
  speakerProjectRefPending: 'In-scope references: counting\u2026',
  speakerAxisStats: (transcriptionUnitCount, segmentCount) => `Transcription units: ${transcriptionUnitCount} / Layer segments: ${segmentCount}`,
  speakerAxisStatsPending: 'Transcription units / layer segments: counting\u2026',
  speakerUnusedEntityHint: 'This entity is currently unused and can be safely cleaned up',
  speakerDuplicateEntityHint: (count) => `Detected duplicate-name entity group: ${count}, merge is recommended`,
  draggableLayerRoleDesc: 'Draggable layer',
  layerTypeTranslationShort: 'TR',
  layerTypeTranscriptionShort: 'TX',
  layerHeaderVarietyFallback: 'No variety or alias',
  layerHeaderOrthographyFallback: 'No orthography',
  emptyLayerHint: 'No layers yet — use “Create transcription layer” in the left rail middle slot',
  inspectorAria: 'Current layer details',
  inspectorEmpty: 'Select a layer to view details.',
  inspectorDeleteCurrentLayerTitle: 'Delete current layer',
  inspectorDeleteCurrentLayerAria: 'Delete current layer',
  inspectorLanguage: 'Language',
  inspectorConstraint: 'Constraint',
  inspectorAlias: 'Alias',
  inspectorOrthography: 'Orthography',
  inspectorParentLayer: 'Parent transcription layer',
  inspectorParentLayerAria: 'Parent transcription layer',
  inspectorSelectPlaceholder: 'Please select',
  inspectorNoIndependentLayer: 'No independent transcription layer available for binding.',
  overviewLayerListAria: 'Layer list',
  overviewLayerListTitle: 'Layer list',
  quickActionsAria: 'Layer management quick actions',
  quickActionCreateTranscription: 'Create transcription layer',
  quickActionCreateTranslation: 'Create translation layer',
  quickActionMore: 'More',
  quickActionMoreAria: 'More actions',
  quickActionSpeakerManagement: 'Speaker management',
  quickActionDeleteCurrentLayer: 'Delete current layer',
  quickActionRepairing: 'Repairing\u2026',
  quickActionRepair: 'Constraint repair',
  deleteLayerModalAria: 'Delete layer',
  deleteKeepUnits: 'Keep existing unit ranges',
  deleteButton: 'Delete',
  cancelButton: 'Cancel',
  closeButton: 'Close',
  repairDetailsAria: 'Constraint repair details',
  repairDetailsTitle: 'Repair details',
  repairDetailsExpandAria: 'Expand repair details',
  repairDetailsCollapseAria: 'Collapse repair details',
  repairDetailsExpand: 'Expand details',
  repairDetailsCollapse: 'Collapse details',
  quickActionsCardAria: 'Layer management quick actions card',
  quickActionsCardTitle: 'Layer management quick actions',
  presenceCardAria: 'Online collaborators',
  presenceCardTitle: 'Presence',
  presenceEmpty: 'No collaborators online right now',
  presenceSelfSuffix: '(you)',
  presenceStateLabel: (state) => {
    if (state === 'idle') return 'Idle';
    if (state === 'offline') return 'Offline';
    return 'Online';
  },
  presenceEntityLabel: (entityType) => {
    if (entityType === 'layer') return 'Layer';
    if (entityType === 'layer_unit') return 'Segment';
    if (entityType === 'layer_unit_content') return 'Segment content';
    if (entityType === 'unit_relation') return 'Layer relation';
    if (entityType === 'asset') return 'Asset';
    if (entityType === 'snapshot') return 'Snapshot';
    if (entityType === 'comment') return 'Comment';
    return 'Entity';
  },
  presenceFocusLabel: (entityLabel, entityId) => `Focus: ${entityLabel} #${entityId}`,
  layerCreateStripAria: 'Create transcription and translation layers',
  inlinePaneAria: 'Text-area layer rail',
  paneTitle: 'Text Layer Workspace',
  paneSubtitle: 'Layer list, current layer details and quick actions',
  segmentListAria: 'Segment list',
  segmentListTitle: 'Segment list',
  segmentListSubtitle: 'Quickly locate segments by text, speaker, and status',
  segmentListLoading: 'Loading segments…',
  segmentListNoSegments: 'No segments in the current layer',
  segmentListNoMatches: 'No segments match the current filters',
  segmentListEmpty: 'No content',
  segmentListFilterPlaceholder: 'Search segment text…',
  segmentListFilterButton: 'Filters',
  segmentListFilterOptionSearchPlaceholder: 'Search filter options…',
  segmentListFilterNoOptions: 'No matching filter options',
  segmentListContentFilterLabel: 'Filter by content state',
  segmentListSpeakerFilterLabel: 'Filter by speaker',
  segmentListNoteCategoryFilterLabel: 'Filter by note category',
  segmentListCertaintyFilterLabel: 'Filter by certainty',
  segmentListAnnotationStatusFilterLabel: 'Filter by annotation status',
  segmentListSourceTypeFilterLabel: 'Filter by source',
  segmentListReviewPresetAll: 'All issues',
  segmentListReviewPresetTime: 'Time issues',
  segmentListReviewPresetContentConcern: 'Content concern',
  segmentListReviewPresetContentMissing: 'Content missing',
  segmentListReviewPresetManualAttention: 'Needs attention',
  segmentListReviewPresetPendingReview: 'Pending review',
  segmentListReviewPrev: 'Previous review item',
  segmentListReviewNext: 'Next review item',
  segmentListSpeakerPending: 'Speaker pending',
  segmentListFilterReset: 'Clear filters',
  segmentListContentStateHasText: 'Has content',
  segmentListContentStateEmptyText: 'Empty',
  segmentListAnnotationStatusRaw: 'Raw',
  segmentListAnnotationStatusTranscribed: 'Transcribed',
  segmentListAnnotationStatusTranslated: 'Translated',
  segmentListAnnotationStatusGlossed: 'Glossed',
  segmentListAnnotationStatusVerified: 'Verified',
  segmentListSourceTypeHuman: 'Human',
  segmentListSourceTypeAi: 'AI',
  segmentListCertaintyNotUnderstood: 'Not understood',
  segmentListCertaintyUncertain: 'Uncertain',
  segmentListCertaintyCertain: 'Certain',
  segmentListNoteCategoryComment: 'Comment',
  segmentListNoteCategoryQuestion: 'Question',
  segmentListNoteCategoryTodo: 'Todo',
  segmentListNoteCategoryLinguistic: 'Linguistic',
  segmentListNoteCategoryFieldwork: 'Fieldwork',
  segmentListNoteCategoryCorrection: 'Correction',
  segmentListTimeRange: (start, end) => `${start} – ${end}`,
  repairNoNeed: 'Layer constraints are valid, no repair needed.',
  repairFailedPrefix: 'Constraint repair failed: ',
  repairSummary: (changedLayers, changedSortLayers, remaining) => `Repaired ${changedLayers} structural constraints and ${changedSortLayers} ordering issues, with ${remaining} still requiring manual handling.`,
  repairSummaryDone: (changedLayers, changedSortLayers) => `Automatically repaired ${changedLayers} structural constraints and ${changedSortLayers} ordering issues.`,
};

export function getSidePaneSidebarMessages(locale: Locale): SidePaneSidebarMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
