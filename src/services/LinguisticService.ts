import type { SpeakerReferenceStatsBundle } from '../hooks/speakerManagement/types';
import type {
  ApplyOrthographyBridgeInput,
  CloneOrthographyToLanguageInput,
  CreateOrthographyBridgeInput,
  CreateOrthographyInput,
  GetActiveOrthographyBridgeInput,
  ListOrthographyBridgesSelector,
  ListOrthographyRecordsSelector,
  PreviewOrthographyBridgeInput,
  UpdateOrthographyBridgeInput,
  UpdateOrthographyInput,
} from './LinguisticService.orthography';
import type {
  CreateStructuralRuleProfileAssetInput,
  PreviewStructuralRuleProfileInput,
  StructuralRuleProfileAssetSelector,
  StructuralRuleProfilePreview,
  UpdateStructuralRuleProfileAssetInput,
} from './LinguisticService.structuralProfiles';
import type {
  LanguageCatalogEntry,
  UpsertLanguageCatalogEntryInput,
} from './LinguisticService.languageCatalog';
import * as linguisticServiceSpeakerOps from './linguisticServiceSpeakerOps';
import * as linguisticServiceMediaImport from './linguisticServiceMediaImport';
import * as linguisticServiceImportQualityReport from './linguisticServiceImportQualityReport';
import * as linguisticServiceLexemeOps from './linguisticServiceLexemeOps';
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
import type {
  PreviewTextTimeMappingInput,
  PreviewTextTimeMappingResult,
  TextTimeMapping,
} from './LinguisticService.timeMapping';

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

export class LinguisticService {
  static async generateImportQualityReport(
    textId?: Parameters<typeof linguisticServiceImportQualityReport.generateImportQualityReport>[0],
  ): ReturnType<typeof linguisticServiceImportQualityReport.generateImportQualityReport> {
    return linguisticServiceImportQualityReport.generateImportQualityReport(textId);
  }

  static async getAllUnits(): ReturnType<typeof linguisticServiceUnitTokenOps.getAllUnits> {
    return linguisticServiceUnitTokenOps.getAllUnits();
  }

  static async getUnitAtTime(
    time: number,
  ): ReturnType<typeof linguisticServiceUnitTokenOps.getUnitAtTime> {
    return linguisticServiceUnitTokenOps.getUnitAtTime(time);
  }

  static async getSpeakers(): ReturnType<typeof linguisticServiceSpeakerOps.getSpeakers> {
    return linguisticServiceSpeakerOps.getSpeakers();
  }

  static async getSpeakerReferenceStats(options?: {
    mediaId?: string | null;
  }): Promise<SpeakerReferenceStatsBundle> {
    return linguisticServiceSpeakerOps.getSpeakerReferenceStats(options);
  }

  static async createSpeaker(
    input: Parameters<typeof linguisticServiceSpeakerOps.createSpeaker>[0],
  ) {
    return linguisticServiceSpeakerOps.createSpeaker(input);
  }

  static async renameSpeaker(speakerId: string, nextName: string) {
    return linguisticServiceSpeakerOps.renameSpeaker(speakerId, nextName);
  }

  static async mergeSpeakers(sourceSpeakerId: string, targetSpeakerId: string) {
    return linguisticServiceSpeakerOps.mergeSpeakers(sourceSpeakerId, targetSpeakerId);
  }

  static async deleteSpeaker(
    speakerId: string,
    options: Parameters<typeof linguisticServiceSpeakerOps.deleteSpeaker>[1] = {},
  ) {
    return linguisticServiceSpeakerOps.deleteSpeaker(speakerId, options);
  }

  static async assignSpeakerToUnits(unitIds: Iterable<string>, speakerId?: string) {
    return linguisticServiceSpeakerOps.assignSpeakerToUnits(unitIds, speakerId);
  }

  static async assignSpeakerToSegments(segmentIds: Iterable<string>, speakerId?: string) {
    return linguisticServiceSpeakerOps.assignSpeakerToSegments(segmentIds, speakerId);
  }

  static async saveUnit(
    data: Parameters<typeof linguisticServiceUnitTokenOps.saveUnit>[0],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.saveUnit> {
    return linguisticServiceUnitTokenOps.saveUnit(data);
  }

  static async getUnitsByTextId(
    textId: string,
  ): ReturnType<typeof linguisticServiceUnitTokenOps.getUnitsByTextId> {
    return linguisticServiceUnitTokenOps.getUnitsByTextId(textId);
  }

  static async saveUnitsBatch(
    items: Parameters<typeof linguisticServiceUnitTokenOps.saveUnitsBatch>[0],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.saveUnitsBatch> {
    return linguisticServiceUnitTokenOps.saveUnitsBatch(items);
  }

  static async getTokensByUnitId(
    unitId: string,
  ): ReturnType<typeof linguisticServiceUnitTokenOps.getTokensByUnitId> {
    return linguisticServiceUnitTokenOps.getTokensByUnitId(unitId);
  }

  static async getMorphemesByTokenId(
    tokenId: string,
  ): ReturnType<typeof linguisticServiceUnitTokenOps.getMorphemesByTokenId> {
    return linguisticServiceUnitTokenOps.getMorphemesByTokenId(tokenId);
  }

  static async saveToken(
    data: Parameters<typeof linguisticServiceUnitTokenOps.saveToken>[0],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.saveToken> {
    return linguisticServiceUnitTokenOps.saveToken(data);
  }

  static async saveTokensBatch(
    items: Parameters<typeof linguisticServiceUnitTokenOps.saveTokensBatch>[0],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.saveTokensBatch> {
    return linguisticServiceUnitTokenOps.saveTokensBatch(items);
  }

  static async updateTokenPos(
    tokenId: string,
    pos: Parameters<typeof linguisticServiceUnitTokenOps.updateTokenPos>[1],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.updateTokenPos> {
    return linguisticServiceUnitTokenOps.updateTokenPos(tokenId, pos);
  }

  static async updateTokenGloss(
    tokenId: string,
    gloss: string | null,
    lang?: Parameters<typeof linguisticServiceUnitTokenOps.updateTokenGloss>[2],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.updateTokenGloss> {
    return linguisticServiceUnitTokenOps.updateTokenGloss(tokenId, gloss, lang);
  }

  static async batchUpdateTokenPosByForm(
    unitId: string,
    form: string,
    pos: string | null,
    orthographyKey?: Parameters<typeof linguisticServiceUnitTokenOps.batchUpdateTokenPosByForm>[3],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.batchUpdateTokenPosByForm> {
    return linguisticServiceUnitTokenOps.batchUpdateTokenPosByForm(
      unitId,
      form,
      pos,
      orthographyKey,
    );
  }

  static async saveMorpheme(
    data: Parameters<typeof linguisticServiceUnitTokenOps.saveMorpheme>[0],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.saveMorpheme> {
    return linguisticServiceUnitTokenOps.saveMorpheme(data);
  }

  static async saveMorphemesBatch(
    items: Parameters<typeof linguisticServiceUnitTokenOps.saveMorphemesBatch>[0],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.saveMorphemesBatch> {
    return linguisticServiceUnitTokenOps.saveMorphemesBatch(items);
  }

  static async removeToken(
    tokenId: string,
  ): ReturnType<typeof linguisticServiceUnitTokenOps.removeToken> {
    return linguisticServiceUnitTokenOps.removeToken(tokenId);
  }

  static async saveTokenLexemeLink(
    data: Parameters<typeof linguisticServiceUnitTokenOps.saveTokenLexemeLink>[0],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.saveTokenLexemeLink> {
    return linguisticServiceUnitTokenOps.saveTokenLexemeLink(data);
  }

  static async getTokenLexemeLinks(
    targetType: Parameters<typeof linguisticServiceUnitTokenOps.getTokenLexemeLinks>[0],
    targetId: string,
  ): ReturnType<typeof linguisticServiceUnitTokenOps.getTokenLexemeLinks> {
    return linguisticServiceUnitTokenOps.getTokenLexemeLinks(targetType, targetId);
  }

  static async removeTokenLexemeLinks(
    targetType: Parameters<typeof linguisticServiceUnitTokenOps.removeTokenLexemeLinks>[0],
    targetId: string,
  ): ReturnType<typeof linguisticServiceUnitTokenOps.removeTokenLexemeLinks> {
    return linguisticServiceUnitTokenOps.removeTokenLexemeLinks(targetType, targetId);
  }

  static async removeTokenLexemeLinksByIds(
    linkIds: Parameters<typeof linguisticServiceUnitTokenOps.removeTokenLexemeLinksByIds>[0],
  ): ReturnType<typeof linguisticServiceUnitTokenOps.removeTokenLexemeLinksByIds> {
    return linguisticServiceUnitTokenOps.removeTokenLexemeLinksByIds(linkIds);
  }

  static async listLexemes(): ReturnType<typeof linguisticServiceLexemeOps.listLexemes> {
    return linguisticServiceLexemeOps.listLexemes();
  }

  static async searchLexemes(
    query: string,
  ): ReturnType<typeof linguisticServiceLexemeOps.searchLexemes> {
    return linguisticServiceLexemeOps.searchLexemes(query);
  }

  static async saveLexeme(
    data: Parameters<typeof linguisticServiceLexemeOps.saveLexeme>[0],
  ): ReturnType<typeof linguisticServiceLexemeOps.saveLexeme> {
    return linguisticServiceLexemeOps.saveLexeme(data);
  }

  static async listLexemeTranscriptionJumpTargets(
    lexemeId: string,
    opts?: Parameters<typeof linguisticServiceLexemeOps.listLexemeTranscriptionJumpTargets>[1],
  ): ReturnType<typeof linguisticServiceLexemeOps.listLexemeTranscriptionJumpTargets> {
    return linguisticServiceLexemeOps.listLexemeTranscriptionJumpTargets(lexemeId, opts);
  }

  static async listDistinctProjectLanguageIds(): ReturnType<
    typeof linguisticServiceLayerOps.listDistinctProjectLanguageIds
  > {
    return linguisticServiceLayerOps.listDistinctProjectLanguageIds();
  }

  static async getTranslationLayers(
    layerType?: Parameters<typeof linguisticServiceLayerOps.getTranslationLayers>[0],
    textId?: Parameters<typeof linguisticServiceLayerOps.getTranslationLayers>[1],
  ): ReturnType<typeof linguisticServiceLayerOps.getTranslationLayers> {
    return linguisticServiceLayerOps.getTranslationLayers(layerType, textId);
  }

  static async saveTranslationLayer(
    data: Parameters<typeof linguisticServiceLayerOps.saveTranslationLayer>[0],
  ): ReturnType<typeof linguisticServiceLayerOps.saveTranslationLayer> {
    return linguisticServiceLayerOps.saveTranslationLayer(data);
  }

  static async upsertLayer(
    data: Parameters<typeof linguisticServiceLayerOps.upsertLayer>[0],
  ): ReturnType<typeof linguisticServiceLayerOps.upsertLayer> {
    return linguisticServiceLayerOps.upsertLayer(data);
  }

  static async getUnitTexts(
    unitId: string,
  ): ReturnType<typeof linguisticServiceTextTimelineOps.getUnitTexts> {
    return linguisticServiceTextTimelineOps.getUnitTexts(unitId);
  }

  static async saveUnitText(
    data: Parameters<typeof linguisticServiceTextTimelineOps.saveUnitText>[0],
  ): ReturnType<typeof linguisticServiceTextTimelineOps.saveUnitText> {
    return linguisticServiceTextTimelineOps.saveUnitText(data);
  }

  static async getAllTexts(): ReturnType<typeof linguisticServiceTextTimelineOps.getAllTexts> {
    return linguisticServiceTextTimelineOps.getAllTexts();
  }

  static async getTextById(
    textId: string,
  ): ReturnType<typeof linguisticServiceTextTimelineOps.getTextById> {
    return linguisticServiceTextTimelineOps.getTextById(textId);
  }

  static async saveText(
    data: Parameters<typeof linguisticServiceTextTimelineOps.saveText>[0],
  ): ReturnType<typeof linguisticServiceTextTimelineOps.saveText> {
    return linguisticServiceTextTimelineOps.saveText(data);
  }

  static async ensureDocumentTimeline(
    input: Parameters<typeof linguisticServiceTextTimelineOps.ensureDocumentTimeline>[0],
  ): ReturnType<typeof linguisticServiceTextTimelineOps.ensureDocumentTimeline> {
    return linguisticServiceTextTimelineOps.ensureDocumentTimeline(input);
  }

  static async updateTextTimeMapping(
    input: Parameters<typeof linguisticServiceTextTimelineOps.updateTextTimeMapping>[0],
  ): ReturnType<typeof linguisticServiceTextTimelineOps.updateTextTimeMapping> {
    return linguisticServiceTextTimelineOps.updateTextTimeMapping(input);
  }

  static previewTextTimeMapping(input: PreviewTextTimeMappingInput): PreviewTextTimeMappingResult {
    return linguisticServiceTextTimelineOps.previewTextTimeMapping(input);
  }

  static invertTextTimeMapping(
    realTime: number,
    mapping: Pick<TextTimeMapping, 'offsetSec' | 'scale'>,
  ): number {
    return linguisticServiceTextTimelineOps.invertTextTimeMapping(realTime, mapping);
  }

  static async getMediaItemsByTextId(
    textId: string,
  ): ReturnType<typeof linguisticServiceMediaReadWrite.getMediaItemsByTextId> {
    return linguisticServiceMediaReadWrite.getMediaItemsByTextId(textId);
  }

  static async saveMediaItem(
    data: Parameters<typeof linguisticServiceMediaReadWrite.saveMediaItem>[0],
  ): ReturnType<typeof linguisticServiceMediaReadWrite.saveMediaItem> {
    return linguisticServiceMediaReadWrite.saveMediaItem(data);
  }

  static async exportToJSON(): ReturnType<typeof linguisticServiceDatabaseIo.exportToJSON> {
    return linguisticServiceDatabaseIo.exportToJSON();
  }

  static async importFromJSON(
    payload: string,
    strategy: Parameters<typeof linguisticServiceDatabaseIo.importFromJSON>[1] = 'upsert',
  ): ReturnType<typeof linguisticServiceDatabaseIo.importFromJSON> {
    return linguisticServiceDatabaseIo.importFromJSON(payload, strategy);
  }

  static async getTierDefinitions(
    ...args: Parameters<typeof linguisticServiceTierFacade.getTierDefinitions>
  ) {
    return linguisticServiceTierFacade.getTierDefinitions(...args);
  }

  static async saveTierDefinition(
    ...args: Parameters<typeof linguisticServiceTierFacade.saveTierDefinition>
  ) {
    return linguisticServiceTierFacade.saveTierDefinition(...args);
  }

  static async removeTierDefinition(
    ...args: Parameters<typeof linguisticServiceTierFacade.removeTierDefinition>
  ) {
    return linguisticServiceTierFacade.removeTierDefinition(...args);
  }

  static async getTierAnnotations(
    ...args: Parameters<typeof linguisticServiceTierFacade.getTierAnnotations>
  ) {
    return linguisticServiceTierFacade.getTierAnnotations(...args);
  }

  static async saveTierAnnotation(
    ...args: Parameters<typeof linguisticServiceTierFacade.saveTierAnnotation>
  ) {
    return linguisticServiceTierFacade.saveTierAnnotation(...args);
  }

  static async removeTierAnnotation(
    ...args: Parameters<typeof linguisticServiceTierFacade.removeTierAnnotation>
  ) {
    return linguisticServiceTierFacade.removeTierAnnotation(...args);
  }

  static async saveTierAnnotationsBatch(
    ...args: Parameters<typeof linguisticServiceTierFacade.saveTierAnnotationsBatch>
  ) {
    return linguisticServiceTierFacade.saveTierAnnotationsBatch(...args);
  }

  static async getAuditLogs(...args: Parameters<typeof linguisticServiceTierFacade.getAuditLogs>) {
    return linguisticServiceTierFacade.getAuditLogs(...args);
  }

  static async getAuditLogsByCollection(
    ...args: Parameters<typeof linguisticServiceTierFacade.getAuditLogsByCollection>
  ) {
    return linguisticServiceTierFacade.getAuditLogsByCollection(...args);
  }

  static async pruneAuditLogs(
    ...args: Parameters<typeof linguisticServiceTierFacade.pruneAuditLogs>
  ) {
    return linguisticServiceTierFacade.pruneAuditLogs(...args);
  }

  static async createProject(
    input: Parameters<typeof linguisticServiceProjectBootstrap.createProject>[0],
  ): ReturnType<typeof linguisticServiceProjectBootstrap.createProject> {
    return linguisticServiceProjectBootstrap.createProject(input);
  }

  static async createOrthography(input: CreateOrthographyInput) {
    return linguisticServiceOrthographyFacade.createOrthography(input);
  }

  static async cloneOrthographyToLanguage(input: CloneOrthographyToLanguageInput) {
    return linguisticServiceOrthographyFacade.cloneOrthographyToLanguage(input);
  }

  static async listOrthographies(selector: ListOrthographyRecordsSelector = {}) {
    return linguisticServiceOrthographyFacade.listOrthographies(selector);
  }

  static async updateOrthography(input: UpdateOrthographyInput) {
    return linguisticServiceOrthographyFacade.updateOrthography(input);
  }

  static async createOrthographyBridge(input: CreateOrthographyBridgeInput) {
    return linguisticServiceOrthographyFacade.createOrthographyBridge(input);
  }

  static async listOrthographyBridges(selector: ListOrthographyBridgesSelector = {}) {
    return linguisticServiceOrthographyFacade.listOrthographyBridges(selector);
  }

  static async updateOrthographyBridge(input: UpdateOrthographyBridgeInput) {
    return linguisticServiceOrthographyFacade.updateOrthographyBridge(input);
  }

  static async listLanguageCatalogEntries(input: {
    locale: 'zh-CN' | 'en-US';
    searchText?: string;
    includeHidden?: boolean;
    languageIds?: readonly string[];
  }): Promise<LanguageCatalogEntry[]> {
    return linguisticServiceLanguageCatalogFacade.listLanguageCatalogEntries(input);
  }

  static async getLanguageCatalogEntry(input: {
    languageId: string;
    locale: 'zh-CN' | 'en-US';
  }): Promise<LanguageCatalogEntry | null> {
    return linguisticServiceLanguageCatalogFacade.getLanguageCatalogEntry(input);
  }

  static async upsertLanguageCatalogEntry(
    input: UpsertLanguageCatalogEntryInput,
  ): Promise<LanguageCatalogEntry> {
    return linguisticServiceLanguageCatalogFacade.upsertLanguageCatalogEntry(input);
  }

  static async deleteLanguageCatalogEntry(input: {
    languageId: string;
    reason?: string;
    locale: 'zh-CN' | 'en-US';
  }): Promise<void> {
    return linguisticServiceLanguageCatalogFacade.deleteLanguageCatalogEntry(input);
  }

  static async listLanguageCatalogHistory(languageId: string) {
    return linguisticServiceLanguageCatalogFacade.listLanguageCatalogHistory(languageId);
  }

  static async listCustomFieldDefinitions() {
    return linguisticServiceLanguageCatalogFacade.listCustomFieldDefinitions();
  }

  static async upsertCustomFieldDefinition(
    input: Parameters<
      (typeof import('./LinguisticService.languageCatalog'))['upsertCustomFieldDefinition']
    >[0],
  ) {
    return linguisticServiceLanguageCatalogFacade.upsertCustomFieldDefinition(input);
  }

  static async deleteCustomFieldDefinition(id: string) {
    return linguisticServiceLanguageCatalogFacade.deleteCustomFieldDefinition(id);
  }

  static async refreshLanguageCatalogReadModel(): Promise<void> {
    return linguisticServiceLanguageCatalogFacade.refreshLanguageCatalogReadModel();
  }

  static searchLanguageCatalogEntries(
    query: string,
    locale?: import('../utils/langMapping').LanguageSearchLocale,
    maxResults?: number,
  ): import('../utils/langMapping').LanguageCatalogMatch[] {
    return linguisticServiceLanguageCatalogFacade.searchLanguageCatalogEntries(
      query,
      locale,
      maxResults,
    );
  }

  static resolveLanguageQuery(query: string): string | undefined {
    return linguisticServiceLanguageCatalogFacade.resolveLanguageQuery(query);
  }

  static lookupIso639_3Seed(code: string) {
    return linguisticServiceLanguageCatalogFacade.lookupIso639_3Seed(code);
  }

  static async deleteOrthographyBridge(id: string): Promise<void> {
    return linguisticServiceOrthographyFacade.deleteOrthographyBridge(id);
  }

  static async getActiveOrthographyBridge(input: GetActiveOrthographyBridgeInput) {
    return linguisticServiceOrthographyFacade.getActiveOrthographyBridge(input);
  }

  static async applyOrthographyBridge(input: ApplyOrthographyBridgeInput) {
    return linguisticServiceOrthographyFacade.applyOrthographyBridge(input);
  }

  static previewOrthographyBridge(input: PreviewOrthographyBridgeInput): string {
    return linguisticServiceOrthographyFacade.previewOrthographyBridge(input);
  }

  static async listStructuralRuleProfileAssets(selector: StructuralRuleProfileAssetSelector = {}) {
    return linguisticServiceStructuralProfileFacade.listStructuralRuleProfileAssets(selector);
  }

  static async createStructuralRuleProfileAsset(input: CreateStructuralRuleProfileAssetInput) {
    return linguisticServiceStructuralProfileFacade.createStructuralRuleProfileAsset(input);
  }

  static async updateStructuralRuleProfileAsset(input: UpdateStructuralRuleProfileAssetInput) {
    return linguisticServiceStructuralProfileFacade.updateStructuralRuleProfileAsset(input);
  }

  static async setStructuralRuleProfileAssetEnabled(id: string, enabled: boolean) {
    return linguisticServiceStructuralProfileFacade.setStructuralRuleProfileAssetEnabled(
      id,
      enabled,
    );
  }

  static async previewStructuralRuleProfile(
    input: PreviewStructuralRuleProfileInput,
  ): Promise<StructuralRuleProfilePreview> {
    return linguisticServiceStructuralProfileFacade.previewStructuralRuleProfile(input);
  }

  static async importAudio(
    input: Parameters<typeof linguisticServiceMediaImport.importAudio>[0],
  ): ReturnType<typeof linguisticServiceMediaImport.importAudio> {
    return linguisticServiceMediaImport.importAudio(input);
  }

  static async createPlaceholderMedia(
    input: Parameters<typeof linguisticServiceMediaImport.createPlaceholderMedia>[0],
  ): ReturnType<typeof linguisticServiceMediaImport.createPlaceholderMedia> {
    return linguisticServiceMediaImport.createPlaceholderMedia(input);
  }

  static async expandTextLogicalDurationToAtLeast(
    input: Parameters<typeof linguisticServiceMediaImport.expandTextLogicalDurationToAtLeast>[0],
  ): ReturnType<typeof linguisticServiceMediaImport.expandTextLogicalDurationToAtLeast> {
    return linguisticServiceMediaImport.expandTextLogicalDurationToAtLeast(input);
  }

  static async deleteProject(textId: string): Promise<void> {
    return linguisticServiceCollaborationCleanupFacade.deleteProject(textId);
  }

  static async deleteAudio(mediaId: string): Promise<void> {
    return linguisticServiceCollaborationCleanupFacade.deleteAudio(mediaId);
  }

  static async removeUnit(unitId: string): Promise<void> {
    return linguisticServiceCollaborationCleanupFacade.removeUnit(unitId);
  }

  static async removeUnitsBatch(unitIds: readonly string[]): Promise<void> {
    return linguisticServiceCollaborationCleanupFacade.removeUnitsBatch(unitIds);
  }
}
