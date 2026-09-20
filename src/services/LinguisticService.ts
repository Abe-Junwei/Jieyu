import * as linguisticServiceSpeakerOps from './linguisticServiceSpeakerOps';
import * as linguisticServiceMediaImport from './linguisticServiceMediaImport';
import * as linguisticServiceImportQualityReport from './linguisticServiceImportQualityReport';
import * as linguisticServiceLexemeOps from './linguisticServiceLexemeOps';
import * as linguisticServiceLexemeAssetOps from './linguisticServiceLexemeAssetOps';
import * as linguisticServiceUnitTokenOps from './linguisticServiceUnitTokenOps';
import * as linguisticServiceLayerOps from './linguisticServiceLayerOps';
import * as linguisticServiceTextTimelineOps from './linguisticServiceTextTimelineOps';
import * as linguisticServiceMediaReadWrite from './linguisticServiceMediaReadWrite';
import * as linguisticServiceDatabaseIo from './linguisticServiceDatabaseIo';
import * as linguisticServiceProjectBootstrap from './linguisticServiceProjectBootstrap';
import * as linguisticServiceTierFacade from './linguisticServiceTierFacade';
import * as linguisticServiceLanguageCatalogFacade from './linguisticServiceLanguageCatalogFacade';
import * as linguisticServiceOrthographyFacade from './linguisticServiceOrthographyFacade';
import * as linguisticServiceStructuralProfileFacade from './linguisticServiceStructuralProfileFacade';
import * as linguisticServiceCollaborationCleanupFacade from './linguisticServiceCollaborationCleanupFacade';
import * as linguisticServiceNoteOps from './linguisticServiceNoteOps';
import { listCorpusUnitIndexByTextId } from './corpusUnitIndexQuery';
import { presentTokenLexemeLink, resolveUnitCitation } from './citationResolver';

export { type ImportQualityReport, validateTierConstraints } from './LinguisticService.constraints';

export type {
  OrthographyDocType,
  OrthographyBridgeDocType,
  LanguageCatalogVisibility,
} from '../db';
export type {
  LanguageCatalogEntry,
  LanguageCatalogDisplayNameEntry,
  UpsertLanguageCatalogEntryInput,
} from './LinguisticService.languageCatalog';
export type {
  PreviewTextTimeMappingInput,
  PreviewTextTimeMappingResult,
  TextTimeMapping,
  UpdateTextTimeMappingInput,
} from './LinguisticService.timeMapping';

export type { LexemeTranscriptionJumpTarget } from './linguisticServiceLexemeOps';
export type { LexemeAttachmentView } from './linguisticServiceLexemeAssetOps';

export const LinguisticService = {
  imports: {
    generateQualityReport: linguisticServiceImportQualityReport.generateImportQualityReport,
  },
  speakers: {
    list: linguisticServiceSpeakerOps.getSpeakers,
    getReferenceStats: linguisticServiceSpeakerOps.getSpeakerReferenceStats,
    create: linguisticServiceSpeakerOps.createSpeaker,
    patchImportAttrs: linguisticServiceSpeakerOps.patchSpeakerImportAttrs,
    rename: linguisticServiceSpeakerOps.renameSpeaker,
    merge: linguisticServiceSpeakerOps.mergeSpeakers,
    delete: linguisticServiceSpeakerOps.deleteSpeaker,
    assignToUnits: linguisticServiceSpeakerOps.assignSpeakerToUnits,
    assignToSegments: linguisticServiceSpeakerOps.assignSpeakerToSegments,
  },
  units: {
    getAll: linguisticServiceUnitTokenOps.getAllUnits,
    getAtTime: linguisticServiceUnitTokenOps.getUnitAtTime,
    save: linguisticServiceUnitTokenOps.saveUnit,
    listByTextId: linguisticServiceUnitTokenOps.getUnitsByTextId,
    listCorpusIndexByTextId: listCorpusUnitIndexByTextId,
    saveBatch: linguisticServiceUnitTokenOps.saveUnitsBatch,
    listTokensByUnitId: linguisticServiceUnitTokenOps.getTokensByUnitId,
    listTokensByUnitIds: linguisticServiceUnitTokenOps.listTokensByUnitIds,
    listMorphemesByTokenId: linguisticServiceUnitTokenOps.getMorphemesByTokenId,
    listMorphemesByTokenIds: linguisticServiceUnitTokenOps.listMorphemesByTokenIds,
    saveToken: linguisticServiceUnitTokenOps.saveToken,
    saveTokensBatch: linguisticServiceUnitTokenOps.saveTokensBatch,
    updateTokenPos: linguisticServiceUnitTokenOps.updateTokenPos,
    updateTokenGloss: linguisticServiceUnitTokenOps.updateTokenGloss,
    batchUpdateTokenPosByForm: linguisticServiceUnitTokenOps.batchUpdateTokenPosByForm,
    saveMorpheme: linguisticServiceUnitTokenOps.saveMorpheme,
    saveMorphemesBatch: linguisticServiceUnitTokenOps.saveMorphemesBatch,
    replaceMorphemesForToken: linguisticServiceUnitTokenOps.replaceMorphemesForToken,
    removeToken: linguisticServiceUnitTokenOps.removeToken,
    saveTokenLexemeLink: linguisticServiceUnitTokenOps.saveTokenLexemeLink,
    listTokenLexemeLinks: linguisticServiceUnitTokenOps.getTokenLexemeLinks,
    removeTokenLexemeLinks: linguisticServiceUnitTokenOps.removeTokenLexemeLinks,
    removeTokenLexemeLinksByIds: linguisticServiceUnitTokenOps.removeTokenLexemeLinksByIds,
  },
  lexemes: {
    list: linguisticServiceLexemeOps.listLexemes,
    search: linguisticServiceLexemeOps.searchLexemes,
    save: linguisticServiceLexemeOps.saveLexeme,
    delete: linguisticServiceLexemeOps.deleteLexeme,
    matchOrCreateByForm: linguisticServiceLexemeOps.matchOrCreateLexemeByForm,
    listTranscriptionJumpTargets: linguisticServiceLexemeOps.listLexemeTranscriptionJumpTargets,
    listAttachments: linguisticServiceLexemeAssetOps.listLexemeAttachments,
    attachFile: linguisticServiceLexemeAssetOps.attachLexemeFile,
    unlinkAttachment: linguisticServiceLexemeAssetOps.unlinkLexemeAttachment,
  },
  layers: {
    listDistinctProjectLanguageIds: linguisticServiceLayerOps.listDistinctProjectLanguageIds,
    listTranslation: linguisticServiceLayerOps.getTranslationLayers,
    listByTextId: (textId: string) =>
      linguisticServiceLayerOps.getTranslationLayers(undefined, textId),
    saveTranslation: linguisticServiceLayerOps.saveTranslationLayer,
    upsert: linguisticServiceLayerOps.upsertLayer,
  },
  timeline: {
    listUnitTexts: linguisticServiceTextTimelineOps.getUnitTexts,
    saveUnitText: linguisticServiceTextTimelineOps.saveUnitText,
    listTexts: linguisticServiceTextTimelineOps.getAllTexts,
    getTextById: linguisticServiceTextTimelineOps.getTextById,
    saveText: linguisticServiceTextTimelineOps.saveText,
    ensureDocument: linguisticServiceTextTimelineOps.ensureDocumentTimeline,
    updateTimeMapping: linguisticServiceTextTimelineOps.updateTextTimeMapping,
    previewTimeMapping: linguisticServiceTextTimelineOps.previewTextTimeMapping,
    invertTimeMapping: linguisticServiceTextTimelineOps.invertTextTimeMapping,
  },
  notes: {
    listByTarget: linguisticServiceNoteOps.listNotesByTarget,
    save: linguisticServiceNoteOps.saveUserNote,
  },
  media: {
    listByTextId: linguisticServiceMediaReadWrite.getMediaItemsByTextId,
    save: linguisticServiceMediaReadWrite.saveMediaItem,
    importAudio: linguisticServiceMediaImport.importAudio,
    createPlaceholder: linguisticServiceMediaImport.createPlaceholderMedia,
    expandTextLogicalDurationToAtLeast:
      linguisticServiceMediaImport.expandTextLogicalDurationToAtLeast,
    setTextLogicalDurationSec: linguisticServiceMediaImport.setTextLogicalDurationSec,
  },
  database: {
    exportToJSON: linguisticServiceDatabaseIo.exportToJSON,
    importFromJSON: linguisticServiceDatabaseIo.importFromJSON,
  },
  tiers: {
    getDefinitions: linguisticServiceTierFacade.getTierDefinitions,
    saveDefinition: linguisticServiceTierFacade.saveTierDefinition,
    removeDefinition: linguisticServiceTierFacade.removeTierDefinition,
    getAnnotations: linguisticServiceTierFacade.getTierAnnotations,
    saveAnnotation: linguisticServiceTierFacade.saveTierAnnotation,
    removeAnnotation: linguisticServiceTierFacade.removeTierAnnotation,
    saveAnnotationsBatch: linguisticServiceTierFacade.saveTierAnnotationsBatch,
    getAuditLogs: linguisticServiceTierFacade.getAuditLogs,
    getAuditLogsByCollection: linguisticServiceTierFacade.getAuditLogsByCollection,
    pruneAuditLogs: linguisticServiceTierFacade.pruneAuditLogs,
  },
  projects: {
    create: linguisticServiceProjectBootstrap.createProject,
  },
  orthography: {
    create: linguisticServiceOrthographyFacade.createOrthography,
    cloneToLanguage: linguisticServiceOrthographyFacade.cloneOrthographyToLanguage,
    list: linguisticServiceOrthographyFacade.listOrthographies,
    update: linguisticServiceOrthographyFacade.updateOrthography,
    createBridge: linguisticServiceOrthographyFacade.createOrthographyBridge,
    listBridges: linguisticServiceOrthographyFacade.listOrthographyBridges,
    updateBridge: linguisticServiceOrthographyFacade.updateOrthographyBridge,
    deleteBridge: linguisticServiceOrthographyFacade.deleteOrthographyBridge,
    getActiveBridge: linguisticServiceOrthographyFacade.getActiveOrthographyBridge,
    applyBridge: linguisticServiceOrthographyFacade.applyOrthographyBridge,
    previewBridge: linguisticServiceOrthographyFacade.previewOrthographyBridge,
  },
  languageCatalog: {
    listEntries: linguisticServiceLanguageCatalogFacade.listLanguageCatalogEntries,
    getEntry: linguisticServiceLanguageCatalogFacade.getLanguageCatalogEntry,
    upsertEntry: linguisticServiceLanguageCatalogFacade.upsertLanguageCatalogEntry,
    deleteEntry: linguisticServiceLanguageCatalogFacade.deleteLanguageCatalogEntry,
    listHistory: linguisticServiceLanguageCatalogFacade.listLanguageCatalogHistory,
    listCustomFieldDefinitions: linguisticServiceLanguageCatalogFacade.listCustomFieldDefinitions,
    upsertCustomFieldDefinition: linguisticServiceLanguageCatalogFacade.upsertCustomFieldDefinition,
    deleteCustomFieldDefinition: linguisticServiceLanguageCatalogFacade.deleteCustomFieldDefinition,
    refreshReadModel: linguisticServiceLanguageCatalogFacade.refreshLanguageCatalogReadModel,
    searchEntries: linguisticServiceLanguageCatalogFacade.searchLanguageCatalogEntries,
    resolveQuery: linguisticServiceLanguageCatalogFacade.resolveLanguageQuery,
    lookupIso639_3Seed: linguisticServiceLanguageCatalogFacade.lookupIso639_3Seed,
  },
  structuralProfiles: {
    listAssets: linguisticServiceStructuralProfileFacade.listStructuralRuleProfileAssets,
    createAsset: linguisticServiceStructuralProfileFacade.createStructuralRuleProfileAsset,
    updateAsset: linguisticServiceStructuralProfileFacade.updateStructuralRuleProfileAsset,
    setAssetEnabled: linguisticServiceStructuralProfileFacade.setStructuralRuleProfileAssetEnabled,
    preview: linguisticServiceStructuralProfileFacade.previewStructuralRuleProfile,
  },
  cleanup: {
    deleteProject: linguisticServiceCollaborationCleanupFacade.deleteProject,
    deleteAudio: linguisticServiceCollaborationCleanupFacade.deleteAudio,
    removeUnit: linguisticServiceCollaborationCleanupFacade.removeUnit,
    removeUnitsBatch: linguisticServiceCollaborationCleanupFacade.removeUnitsBatch,
  },
  citations: {
    resolveUnit: resolveUnitCitation,
    presentTokenLexemeLink,
  },
} as const;

export type LinguisticServiceApi = typeof LinguisticService;
