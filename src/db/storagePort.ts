/**
 * ADR-0048：存储接口。一次方法调用是一次业务操作。
 * 调用方经 `storagePort()` 取当前实现。未安装时抛错。
 * Dexie 实现在 `dexieStoragePort.ts`；桌面壳用 `installStoragePort` 换成 IPC。
 */
import type {
  AgentArtifactDoc,
  AiConversationDoc,
  AiMessageDoc,
  AnchorDocType,
  AuditLogDocType,
  McpToolCallAuditDoc,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
  NoteTargetType,
  SegmentMetaDocType,
  SpeakerDocType,
  TextDocType,
  SourceRecordDocType,
  TierDefinitionDocType,
  TrackEntityDocType,
  TranslationStatusSnapshotDocType,
  UserNoteDocType,
  UserNoteDraft,
  UnitMorphemeDocType,
  UnitTokenDocType,
} from './types';
import type { ForeignOwnedRow } from './storagePortProjectReads';
import type { AiConversationPatch } from './storagePortConversations';
import type { AiMessageContentPatch } from './storagePortWriteProbes';
import type { SourceRecordRegistration } from './storagePortSourceRecords';
import type { SourceImportPlan } from '../services/sourceRecordPlan';

export {
  RecordingRemovalBlockedError,
  recordingRemovalBlockReason,
} from './storagePortErrors';

export { StorageReadbackError } from './storageReadbackError';

type TurnRow = { conversationId: string; createdAt?: unknown; expiresAt?: unknown };

export interface AiRuntimeTurnOps {
  getTurn<T>(conversationId: string): Promise<T | undefined>;
  putTurn<T extends TurnRow>(row: T): Promise<void>;
  deleteTurn(conversationId: string): Promise<void>;
  sweepExpiredTurns(now: number): Promise<void>;
}

export interface AuditLogOps {
  insertAuditLog(row: AuditLogDocType): Promise<void>;
  getAuditLog(id: string): Promise<AuditLogDocType | undefined>;
}

/** 正则拆分已经算好的行。调用方不传表名。 */
export interface RegexSplitCommit {
  anchors: AnchorDocType[];
  units: LayerUnitDocType[];
  contents: LayerUnitContentDocType[];
  /** 这些句段（须在 `units` 里）已有的分词段，在同一事务里改成句段的新起止时间。 */
  resizeSegmentsOf?: string[];
}

export interface MixedSpeakerSelectionWrite {
  textId: string;
  segmentIds: readonly string[];
  unitIds: readonly string[];
  speakerId?: string;
  createSpeaker?: { name: string; textId: string };
}

export interface MixedSpeakerSelectionResult {
  segments: number;
  units: number;
  speaker?: SpeakerDocType;
  created?: boolean;
}

/** 调用方不传表名，也不接收事务回调。 */
export interface ManuscriptRelationWrite {
  id: string;
  sourceUnitId: string;
  targetUnitId: string;
  relationType: 'aligned_to' | 'derived_from' | 'linked_reference';
}

export interface StoragePort {
  turns: AiRuntimeTurnOps;
  fingerprintTarget(id: string): Promise<string | undefined>;
  audit: AuditLogOps;
  commitRegexSplit(write: RegexSplitCommit): Promise<{ resizedSegmentIds: string[] }>;
  assignSpeakerToMixedSelection(
    write: MixedSpeakerSelectionWrite,
  ): Promise<MixedSpeakerSelectionResult>;
  /**
   * 移除一条没有可播放字节的录音。
   * 同事务解开指向它的来源文稿，文稿本身留下；句段和锚点留在项目里，改挂到未绑定录音。
   * 同名的其他录音不动。
   */
  removeEmptyRecording(mediaId: string): Promise<{ unboundSourceIds: string[] }>;
  /** 把一份文稿改挂到另一条录音，或摘掉。已有的就是替换。浏览器库没有文稿文件，会拒绝。 */
  replaceManuscriptAudio(manuscriptId: string, audioId: string | null): Promise<void>;
  /** 在一份文稿里写下语段关系。两端不在同一份文稿就不写。浏览器库会拒绝。 */
  putUnitRelation(relation: ManuscriptRelationWrite): Promise<void>;
  /** 在同一份文稿里改父子链接。父语段在另一份文稿就不写。浏览器库会拒绝。 */
  setUnitParent(unitId: string, parentUnitId: string | null): Promise<void>;
  readProject(textId: string): Promise<TextDocType | undefined>;
  listForeignOwnedUnits(unitIds: Iterable<string>, textId: string): Promise<ForeignOwnedRow[]>;
  listForeignOwnedLayers(layerIds: Iterable<string>, textId: string): Promise<ForeignOwnedRow[]>;
  listForeignOwnedMedia(mediaIds: Iterable<string>, textId: string): Promise<ForeignOwnedRow[]>;
  listTrackEntities(textId: string): Promise<TrackEntityDocType[]>;
  putTrackEntity(doc: TrackEntityDocType): Promise<void>;
  readLayerUnit(unitId: string): Promise<LayerUnitDocType | undefined>;
  countAnnotationDocuments(textId: string): Promise<number>;
  listSourceRecords(textId: string): Promise<SourceRecordDocType[]>;
  registerImportedSource(
    input: SourceRecordRegistration,
  ): Promise<{ plan: SourceImportPlan; record: SourceRecordDocType }>;
  renameSourceRecord(
    textId: string,
    recordId: string,
    displayName: string,
  ): Promise<SourceRecordDocType | undefined>;
  linkSourceRecordMedia(
    textId: string,
    recordId: string,
    mediaId: string | null,
  ): Promise<SourceRecordDocType | undefined>;
  /** 首页进度和项目概览用的只读计数与快照。 */
  countAnchorsByMedia(mediaId: string): Promise<number>;
  countUnitTokensByText(textId: string): Promise<number>;
  listSegmentMetaByText(textId: string): Promise<SegmentMetaDocType[]>;
  listSegmentMetaForMediaLayers(
    mediaId: string,
    layerIds: readonly string[],
  ): Promise<SegmentMetaDocType[]>;
  listSegmentMetaForTextLayers(
    textId: string,
    layerIds: readonly string[],
  ): Promise<SegmentMetaDocType[]>;
  listTranslationSnapshotsByMedia(mediaId: string): Promise<TranslationStatusSnapshotDocType[]>;
  listTranslationSnapshotsByText(textId: string): Promise<TranslationStatusSnapshotDocType[]>;
  listUnitTokensByText(textId: string): Promise<UnitTokenDocType[]>;
  listUnitMorphemesByText(textId: string): Promise<UnitMorphemeDocType[]>;
  listMediaByText(textId: string): Promise<MediaItemDocType[]>;
  saveMediaItem(data: MediaItemDocType): Promise<string>;
  countPresentLayerUnits(ids: readonly string[]): Promise<number>;
  listLayerUnitIdsByText(textId: string): Promise<string[]>;
  listLayerUnitsAtMediaStart(mediaId: string, startTime: number): Promise<LayerUnitDocType[]>;
  readTierDefinition(layerId: string): Promise<TierDefinitionDocType | undefined>;
  listTierIdsByContentLanguage(
    contentType: TierDefinitionDocType['contentType'],
    languageId: string,
  ): Promise<string[]>;
  patchAiMessageContent(id: string, patch: AiMessageContentPatch): Promise<void>;
  listMediaIdsByText(textId: string): Promise<string[]>;
  listNotesByTarget(targetType: NoteTargetType, targetId: string): Promise<UserNoteDocType[]>;
  putUserNote(
    doc: UserNoteDraft,
  ): Promise<{ id: string; targetId: string; parentTargetId?: string; unitId: string }>;
  listAiMessagesByConversation(conversationId: string): Promise<AiMessageDoc[]>;
  listAuditLogsByCollection(collection: string): Promise<AuditLogDocType[]>;
  listAuditLogsByFieldRequest(
    collection: string,
    field: string,
    requestId: string,
  ): Promise<AuditLogDocType[]>;
  insertMcpToolCallAudit(doc: McpToolCallAuditDoc): Promise<void>;
  readAgentArtifact(id: string): Promise<AgentArtifactDoc | undefined>;
  saveAgentArtifact(doc: AgentArtifactDoc, audit: AuditLogDocType): Promise<AgentArtifactDoc>;
  listRecentAiConversations(limit: number): Promise<AiConversationDoc[]>;
  readAiConversation(id: string): Promise<AiConversationDoc | undefined>;
  patchAiConversation(
    id: string,
    patch: AiConversationPatch,
  ): Promise<AiConversationDoc | undefined>;
  clearAiConversationMessages(conversationId: string, updatedAt: string): Promise<boolean>;
}

let current: StoragePort | undefined;

export function storagePort(): StoragePort {
  if (current === undefined) throw new Error('storagePort is not installed');
  return current;
}

export function installStoragePort(port: StoragePort): void {
  current = port;
}
