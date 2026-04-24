import { normalizeLocale, type Locale } from './index';
import { formatCatalogTemplate, readMessageCatalog } from './messageCatalog';

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
  /** Workspace timeline layout (horizontal vs vertical reading) toggle in the left rail. */
  workspaceLayoutModeStripAria: string;
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

type SidePaneSidebarCatalog = Omit<
  SidePaneSidebarMessages,
  | 'speakerEntityCount'
  | 'speakerReferencedInScope'
  | 'speakerReferencedProject'
  | 'speakerStatsScopeLabel'
  | 'speakerUnassignedAxisStats'
  | 'speakerUnusedCount'
  | 'speakerDuplicateGroupCount'
  | 'speakerSelectedUnitCount'
  | 'speakerCleanupUnusedButton'
  | 'speakerCurrentScopeCount'
  | 'speakerProjectRefCount'
  | 'speakerAxisStats'
  | 'speakerDuplicateEntityHint'
  | 'presenceStateLabel'
  | 'presenceEntityLabel'
  | 'presenceFocusLabel'
  | 'segmentListTimeRange'
  | 'repairSummary'
  | 'repairSummaryDone'
> & {
  speakerEntityCount: string;
  speakerReferencedInScope: string;
  speakerReferencedProject: string;
  speakerStatsScopeCurrentMedia: string;
  speakerStatsScopeWholeProject: string;
  speakerUnassignedAxisStats: string;
  speakerUnusedCount: string;
  speakerDuplicateGroupCount: string;
  speakerSelectedUnitCount: string;
  speakerCleanupUnusedButton: string;
  speakerCurrentScopeCount: string;
  speakerProjectRefCount: string;
  speakerAxisStats: string;
  speakerDuplicateEntityHint: string;
  presenceStateLabels: Record<'online' | 'idle' | 'offline', string>;
  presenceEntityLabels: Record<string, string> & { default: string };
  presenceFocusLabel: string;
  segmentListTimeRange: string;
  repairSummary: string;
  repairSummaryDone: string;
};

export function getSidePaneSidebarMessages(locale: Locale): SidePaneSidebarMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  const catalog = readMessageCatalog<SidePaneSidebarCatalog>(normalizedLocale, 'msg.sidePaneSidebar.catalog');
  return {
    ...catalog,
    speakerEntityCount: (count) => formatCatalogTemplate(catalog.speakerEntityCount, { count }),
    speakerReferencedInScope: (count) => formatCatalogTemplate(catalog.speakerReferencedInScope, { count }),
    speakerReferencedProject: (count) => formatCatalogTemplate(catalog.speakerReferencedProject, { count }),
    speakerStatsScopeLabel: (scopedToCurrentMedia) =>
      scopedToCurrentMedia ? catalog.speakerStatsScopeCurrentMedia : catalog.speakerStatsScopeWholeProject,
    speakerUnassignedAxisStats: (transcriptionUnitCount, segmentCount) =>
      formatCatalogTemplate(catalog.speakerUnassignedAxisStats, { transcriptionUnitCount, segmentCount }),
    speakerUnusedCount: (count) => formatCatalogTemplate(catalog.speakerUnusedCount, { count }),
    speakerDuplicateGroupCount: (count) => formatCatalogTemplate(catalog.speakerDuplicateGroupCount, { count }),
    speakerSelectedUnitCount: (count) => formatCatalogTemplate(catalog.speakerSelectedUnitCount, { count }),
    speakerCleanupUnusedButton: (count) => formatCatalogTemplate(catalog.speakerCleanupUnusedButton, { count }),
    speakerCurrentScopeCount: (count) => formatCatalogTemplate(catalog.speakerCurrentScopeCount, { count }),
    speakerProjectRefCount: (count) => formatCatalogTemplate(catalog.speakerProjectRefCount, { count }),
    speakerAxisStats: (transcriptionUnitCount, segmentCount) =>
      formatCatalogTemplate(catalog.speakerAxisStats, { transcriptionUnitCount, segmentCount }),
    speakerDuplicateEntityHint: (count) => formatCatalogTemplate(catalog.speakerDuplicateEntityHint, { count }),
    presenceStateLabel: (state) => catalog.presenceStateLabels[state] ?? catalog.presenceStateLabels.online,
    presenceEntityLabel: (entityType) => catalog.presenceEntityLabels[entityType] ?? catalog.presenceEntityLabels.default,
    presenceFocusLabel: (entityLabel, entityId) => formatCatalogTemplate(catalog.presenceFocusLabel, { entityLabel, entityId }),
    segmentListTimeRange: (start, end) => formatCatalogTemplate(catalog.segmentListTimeRange, { start, end }),
    repairSummary: (changedLayers, changedSortLayers, remaining) =>
      formatCatalogTemplate(catalog.repairSummary, { changedLayers, changedSortLayers, remaining }),
    repairSummaryDone: (changedLayers, changedSortLayers) =>
      formatCatalogTemplate(catalog.repairSummaryDone, { changedLayers, changedSortLayers }),
  };
}
