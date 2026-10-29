import type {
  BridgeCreate,
  LanguageEnsure,
  OrthographyCreate,
  ProjectBridge,
  ProjectLanguage,
  ProjectOrthography,
} from './catalog';
import type { Layer, LayerCreate } from './layers';
import type { LexemeLinkWrite, LexemeSave, ProjectLexeme, ProjectLexemeLink } from './lexicon';
import type { Media, MediaCreate } from './media';
import type { ImportResult } from './foreignImport';
import type { ProjectIdentity } from './projectIdentity';
import type { Manuscript, ManuscriptCreate, ManuscriptDeletePreview } from './manuscripts';
import type { DeletionReminder, DueDeletionReminder } from './manuscriptPurge';
import type { AnalysisApplyResult } from './analysis';
import type { AnalysisImportResult } from './analysisImport';
import type {
  AnalysisAcceptResult,
  AnalysisCredentials,
  AnalysisReadState,
} from './analysisRestore';
import type { AnalysisCandidateRecord } from './analysisCandidates';
import type { CustomFieldMigrationPreview } from './customFieldMigration';
import type { CustomFieldPurgePreview } from './customFieldPurge';
import type { LexemeLinkReading } from './referenceState';
import type { SourcePatch, SourceReading } from './sourceFields';
import type {
  CustomFieldDefinition,
  CustomFieldHostPreview,
  CustomFieldHostValue,
  CustomFieldLocation,
  CustomFieldPreview,
  CustomFieldUnitValue,
} from './customFields';
import type { CorpusQueryCursor, CorpusQueryPage } from './corpusQuery';
import type { Conversation, ConversationCreate } from './conversations';
import type { Message, MessageAppend } from './messages';
import type { Speaker } from './speakers';
import type { AnalysisRoot, Unit, UnitCreate } from './units';
import type { ContentNote, ContentNoteQuery, ContentNoteWrite } from './notes';
import type { JieyuAnchoredNote } from '../dmlexTypes';
import type { AttachmentLinkView } from './attachments';
import type {
  AcceptableRun,
  PreviewCandidate,
  PreviewCandidateInput,
  TranscriptionAcceptance,
} from './modelRuns';
import type { MediaCleanup } from './mediaCleanup';

export interface DesktopBridge {
  desktopCall(sessionId: string, method: string, args: unknown): Promise<unknown>;
}

/** One bridge call per action. A lost response is returned as a failure and is not sent again. */
export function createDesktopClient(bridge: DesktopBridge) {
  async function once<T>(sessionId: string, method: string, args: unknown): Promise<T> {
    return (await bridge.desktopCall(sessionId, method, args)) as T;
  }
  return {
    createMedia: (sessionId: string, input: MediaCreate) =>
      once<Media>(sessionId, 'media.create', input),
    createManuscript: (sessionId: string, input: ManuscriptCreate) =>
      once<Manuscript>(sessionId, 'manuscripts.create', input),
    createLayer: (sessionId: string, input: LayerCreate) =>
      once<Layer>(sessionId, 'layers.create', input),
    createUnit: (sessionId: string, input: UnitCreate) =>
      once<Unit>(sessionId, 'units.create', input),
    getUnit: (sessionId: string, id: string) => once<Unit | null>(sessionId, 'units.get', { id }),
    listManuscripts: (sessionId: string) => once<Manuscript[]>(sessionId, 'manuscripts.list', {}),
    getProject: (sessionId: string) => once<ProjectIdentity | null>(sessionId, 'project.get', {}),
    importFile: (sessionId: string, input: { file: string; roles?: string }) =>
      once<ImportResult>(sessionId, 'exchange.importFile', input),
    exportJyt: (sessionId: string, input: { file: string }) =>
      once<{ file: string }>(sessionId, 'exchange.exportJyt', input),
    exportJym: (sessionId: string, input: { file: string }) =>
      once<{ file: string }>(sessionId, 'exchange.exportJym', input),
    exportManuscript: (sessionId: string, input: { file: string; manuscriptId: string }) =>
      once<{ file: string }>(sessionId, 'exchange.exportManuscript', input),
    previewManuscriptDelete: (sessionId: string, id: string) =>
      once<ManuscriptDeletePreview>(sessionId, 'manuscripts.previewDelete', { id }),
    deleteManuscript: (sessionId: string, id: string) =>
      once<Manuscript>(sessionId, 'manuscripts.delete', { id }),
    listDueReminders: (sessionId: string) =>
      once<DueDeletionReminder[]>(sessionId, 'deletion.listDue', {}),
    showManuscriptReminder: (sessionId: string, id: string) =>
      once<DeletionReminder>(sessionId, 'manuscripts.showReminder', { id }),
    showRecordingReminder: (sessionId: string, id: string) =>
      once<DeletionReminder>(sessionId, 'media.showReminder', { id }),
    listLayers: (sessionId: string, manuscriptId: string) =>
      once<Layer[]>(sessionId, 'layers.list', { manuscriptId }),
    listUnits: (sessionId: string, layerId: string) =>
      once<Unit[]>(sessionId, 'units.list', { layerId }),
    queryCorpus: (
      sessionId: string,
      input: {
        manuscriptId?: string;
        text?: string;
        form?: string;
        gloss?: string;
        pos?: string;
        lexemeId?: string;
        senseId?: string;
        limit: number;
        cursor?: CorpusQueryCursor;
      },
    ) => once<CorpusQueryPage>(sessionId, 'corpus.query', input),
    updateUnitText: (sessionId: string, input: { unitId: string; text: string }) =>
      once<Unit>(sessionId, 'units.updateText', input),
    undoUnitText: (sessionId: string) => once<Unit>(sessionId, 'units.undoText', {}),
    undoStep: (sessionId: string) => once<Unit | Unit[]>(sessionId, 'units.undo', {}),
    splitUnit: (sessionId: string, input: { unitId: string; time: number }) =>
      once<{ left: Unit; right: Unit }>(sessionId, 'units.split', input),
    mergeUnits: (sessionId: string, input: { keepId: string; removeId: string }) =>
      once<Unit>(sessionId, 'units.merge', input),
    updateBoundary: (sessionId: string, input: { leftId: string; rightId: string; time: number }) =>
      once<{ left: Unit; right: Unit }>(sessionId, 'units.updateBoundary', input),
    createCustomFieldDefinition: (sessionId: string, input: unknown) =>
      once<CustomFieldDefinition>(sessionId, 'customFields.createDefinition', input),
    updateCustomFieldDefinition: (sessionId: string, input: unknown) =>
      once<CustomFieldDefinition>(sessionId, 'customFields.updateDefinition', input),
    addCustomFieldOption: (sessionId: string, input: unknown) =>
      once<CustomFieldDefinition>(sessionId, 'customFields.addOption', input),
    updateCustomFieldOptionLabel: (sessionId: string, input: unknown) =>
      once<CustomFieldDefinition>(sessionId, 'customFields.updateOptionLabel', input),
    importCustomFieldDefinition: (sessionId: string, input: unknown) =>
      once<CustomFieldDefinition>(sessionId, 'customFields.importDefinition', input),
    previewUnitValue: (sessionId: string, input: unknown) =>
      once<CustomFieldPreview>(sessionId, 'customFields.previewUnitValue', input),
    setUnitValue: (sessionId: string, input: unknown) =>
      once<CustomFieldUnitValue>(sessionId, 'customFields.setUnitValue', input),
    removeUnitValue: (sessionId: string, input: unknown) =>
      once<void>(sessionId, 'customFields.removeUnitValue', input),
    missingUnitFields: (sessionId: string, unitId: string) =>
      once<string[]>(sessionId, 'customFields.missingUnitFields', { unitId }),
    previewFieldValue: (sessionId: string, input: unknown) =>
      once<CustomFieldHostPreview>(sessionId, 'customFields.previewValue', input),
    setFieldValue: (sessionId: string, input: unknown) =>
      once<CustomFieldHostValue>(sessionId, 'customFields.setValue', input),
    removeFieldValue: (sessionId: string, input: unknown) =>
      once<void>(sessionId, 'customFields.removeValue', input),
    missingFields: (sessionId: string, targetType: string, targetId: string, lexemeId?: string) =>
      once<string[]>(sessionId, 'customFields.missingFields', {
        targetType,
        targetId,
        ...(lexemeId === undefined ? {} : { lexemeId }),
      }),
    listCustomFieldDefinitions: (sessionId: string) =>
      once<CustomFieldDefinition[]>(sessionId, 'customFields.listDefinitions', {}),
    listLexemeLinks: (sessionId: string) =>
      once<LexemeLinkReading[]>(sessionId, 'references.listLinks', {}),
    locateFieldValues: (sessionId: string, definitionId: string) =>
      once<CustomFieldLocation[]>(sessionId, 'customFields.locateValues', { definitionId }),
    previewCustomFieldMigration: (sessionId: string, definitionId: string) =>
      once<CustomFieldMigrationPreview>(sessionId, 'customFields.previewMigration', {
        definitionId,
      }),
    migrateCustomFieldDefinition: (sessionId: string, input: unknown) =>
      once<CustomFieldDefinition>(sessionId, 'customFields.migrateDefinition', input),
    previewCustomFieldPurge: (sessionId: string, definitionId: string) =>
      once<CustomFieldPurgePreview>(sessionId, 'customFields.previewPurge', { definitionId }),
    purgeCustomFieldDefinition: (sessionId: string, input: unknown) =>
      once<void>(sessionId, 'customFields.purgeDefinition', input),
    setTimeMapping: (
      sessionId: string,
      input: {
        manuscriptId: string;
        expectedRevision: number;
        offsetSec: number;
        scale: number;
        sourceMediaId?: string;
      },
    ) => once<Manuscript>(sessionId, 'manuscripts.setTimeMapping', input),
    rollbackTimeMapping: (
      sessionId: string,
      input: { manuscriptId: string; expectedRevision: number },
    ) => once<Manuscript>(sessionId, 'manuscripts.rollbackTimeMapping', input),
    ensureProjectDefinition: (sessionId: string, input: LanguageEnsure) =>
      once<ProjectLanguage>(sessionId, 'catalog.ensureProjectDefinition', input),
    getLanguage: (sessionId: string, id: string) =>
      once<ProjectLanguage | null>(sessionId, 'catalog.getLanguage', { id }),
    createOrthography: (sessionId: string, input: OrthographyCreate) =>
      once<ProjectOrthography>(sessionId, 'orthographies.create', input),
    createBridge: (sessionId: string, input: BridgeCreate) =>
      once<ProjectBridge>(sessionId, 'bridges.create', input),
    getBridge: (sessionId: string, id: string) =>
      once<ProjectBridge | null>(sessionId, 'bridges.get', { id }),
    listLanguages: (sessionId: string) =>
      once<ProjectLanguage[]>(sessionId, 'catalog.listLanguages', {}),
    updateLanguage: (sessionId: string, input: { id: string; locale: string; value: string }) =>
      once<ProjectLanguage>(sessionId, 'catalog.updateLanguage', input),
    listOrthographies: (sessionId: string, languageId: string) =>
      once<ProjectOrthography[]>(sessionId, 'orthographies.list', { languageId }),
    updateOrthography: (sessionId: string, input: { id: string; scriptTag: string }) =>
      once<ProjectOrthography>(sessionId, 'orthographies.update', input),
    listBridges: (sessionId: string) => once<ProjectBridge[]>(sessionId, 'bridges.list', {}),
    updateBridge: (sessionId: string, input: { id: string; rules: Record<string, unknown> }) =>
      once<ProjectBridge>(sessionId, 'bridges.update', input),
    createSpeaker: (sessionId: string, input: { name: string }) =>
      once<Speaker>(sessionId, 'speakers.create', input),
    listSpeakers: (sessionId: string) => once<Speaker[]>(sessionId, 'speakers.list', {}),
    assignSpeaker: (sessionId: string, input: { speakerId: string; unitIds: string[] }) =>
      once<Unit[]>(sessionId, 'speakers.assign', input),
    patchSpeaker: (sessionId: string, input: unknown) =>
      once<Speaker>(sessionId, 'speakers.patch', input),
    saveLexemeEntry: (sessionId: string, input: LexemeSave) =>
      once<ProjectLexeme>(sessionId, 'lexicon.saveEntry', input),
    getLexemeEntry: (sessionId: string, id: string) =>
      once<ProjectLexeme | null>(sessionId, 'lexicon.getEntry', { id }),
    linkSense: (sessionId: string, input: LexemeLinkWrite & { lexemeId: string }) =>
      once<ProjectLexemeLink>(sessionId, 'lexicon.linkSense', input),
    removeSense: (sessionId: string, input: { lexemeId: string; senseId: string }) =>
      once<ProjectLexeme>(sessionId, 'lexicon.removeSense', input),
    listLinkCandidates: (sessionId: string) =>
      once<
        {
          id: string;
          headword: string;
          matchValues: string[];
          senses: { id: string; label: string }[];
        }[]
      >(sessionId, 'lexicon.listLinkCandidates', {}),
    matchLexemeLink: (sessionId: string, query: string) =>
      once<{
        id: string;
        headword: string;
        matchValues: string[];
        senses: { id: string; label: string }[];
      }>(sessionId, 'lexicon.matchLink', { query }),
    listTokenLinks: (sessionId: string, unitId: string) =>
      once<{ tokenId: string; lexemeId: string; senseId: string; headword: string | null }[]>(
        sessionId,
        'lexicon.listTokenLinks',
        { unitId },
      ),
    replaceTokenLink: (
      sessionId: string,
      input: { tokenId: string; lexemeId: string; senseId: string },
    ) =>
      once<{ tokenId: string; lexemeId: string; senseId: string; headword: string | null }>(
        sessionId,
        'lexicon.replaceTokenLink',
        input,
      ),
    createLinkedLexeme: (
      sessionId: string,
      input: { targetId: string; headword: string; translation: string },
    ) =>
      once<{ tokenId: string; lexemeId: string; senseId: string; headword: string | null }>(
        sessionId,
        'lexicon.createLinkedEntry',
        input,
      ),
    clearTokenLink: (sessionId: string, tokenId: string) =>
      once<{ tokenId: string; lexemeId: string; senseId: string; headword: string | null }[]>(
        sessionId,
        'lexicon.clearTokenLink',
        { tokenId },
      ),
    createNote: (sessionId: string, input: ContentNoteWrite) =>
      once<ContentNote>(sessionId, 'notes.create', input),
    updateNote: (
      sessionId: string,
      input: {
        id: string;
        content?: Record<string, string>;
        category?: ContentNoteWrite['category'];
      },
    ) => once<ContentNote>(sessionId, 'notes.update', input),
    deleteNote: (sessionId: string, id: string) =>
      once<{ id: string }>(sessionId, 'notes.delete', { id }),
    listNotes: (sessionId: string, input: ContentNoteQuery = {}) =>
      once<ContentNote[]>(sessionId, 'notes.list', input),
    saveLexemeNote: (
      sessionId: string,
      input: {
        lexemeId: string;
        id?: string;
        senseId?: string;
        content: Record<string, string>;
        category?: ContentNoteWrite['category'];
        provenance?: unknown | null;
      },
    ) => once<JieyuAnchoredNote>(sessionId, 'notes.saveLexeme', input),
    listLexemeNotes: (sessionId: string, lexemeId: string) =>
      once<JieyuAnchoredNote[]>(sessionId, 'notes.listLexeme', { lexemeId }),
    applyAnalysis: (
      sessionId: string,
      input: {
        unitId: string;
        expected: {
          manuscriptGeneration: number;
          analysisGeneration: number;
          graphFingerprint: string;
        };
        changes: unknown[];
      },
    ) => once<AnalysisApplyResult>(sessionId, 'analysis.apply', input),
    importAnalysis: (
      sessionId: string,
      input: {
        unitId: string;
        expected: AnalysisCredentials;
        nodes?: unknown[];
        relations?: unknown[];
        removeNodes?: string[];
        removeRelations?: string[];
      },
    ) => once<AnalysisImportResult>(sessionId, 'analysis.import', input),
    readAnalysisState: (sessionId: string, unitId: string) =>
      once<AnalysisReadState>(sessionId, 'analysis.readState', { unitId }),
    listCandidates: (sessionId: string, unitId: string) =>
      once<AnalysisCandidateRecord[]>(sessionId, 'analysis.listCandidates', { unitId }),
    listWords: (sessionId: string, unitId: string) =>
      once<{ id: string; form: string; gloss: Record<string, string>; pos: string }[]>(
        sessionId,
        'analysis.listWords',
        { unitId },
      ),
    segmentWords: (sessionId: string, unitId: string) =>
      once<{ id: string; form: string; gloss: Record<string, string>; pos: string }[]>(
        sessionId,
        'analysis.segmentWords',
        { unitId },
      ),
    listMorphemes: (sessionId: string, unitId: string) =>
      once<{ id: string; tokenId: string; form: string; gloss: Record<string, string> }[]>(
        sessionId,
        'analysis.listMorphemes',
        {
          unitId,
        },
      ),
    segmentMorphemes: (sessionId: string, unitId: string) =>
      once<{ id: string; tokenId: string; form: string; gloss: Record<string, string> }[]>(
        sessionId,
        'analysis.segmentMorphemes',
        { unitId },
      ),
    submitAnalysis: (
      sessionId: string,
      input: {
        unitId: string;
        graph: unknown;
        expected: AnalysisCredentials;
        definitionRevisions: { definitionId: string; revision: number }[];
      },
    ) => once<AnalysisCandidateRecord>(sessionId, 'analysis.submit', input),
    acceptAnalysis: (
      sessionId: string,
      input: { candidateId: string; expected: AnalysisCredentials },
    ) => once<AnalysisAcceptResult>(sessionId, 'analysis.accept', input),
    restoreAnalysis: (
      sessionId: string,
      input: { candidateId: string; expected: AnalysisCredentials; conversions?: unknown[] },
    ) => once<AnalysisRoot>(sessionId, 'analysis.restore', input),
    splitAnalysisNode: (
      sessionId: string,
      input: {
        unitId: string;
        nodeId: string;
        into: [unknown, unknown];
        expected: AnalysisCredentials;
      },
    ) => once<AnalysisRoot>(sessionId, 'analysis.split', input),
    mergeAnalysisNodes: (
      sessionId: string,
      input: {
        unitId: string;
        nodeIds: [string, string];
        into: unknown;
        expected: AnalysisCredentials;
      },
    ) => once<AnalysisRoot>(sessionId, 'analysis.merge', input),
    createConversation: (
      sessionId: string,
      title: string,
      fieldValues?: ConversationCreate['fieldValues'],
    ) =>
      once<Conversation>(sessionId, 'conversations.create', {
        title,
        ...(fieldValues === undefined ? {} : { fieldValues }),
      }),
    listConversations: (sessionId: string) =>
      once<Conversation[]>(sessionId, 'conversations.list', {}),
    appendMessage: (sessionId: string, input: MessageAppend) =>
      once<Message>(sessionId, 'messages.append', input),
    listMessages: (sessionId: string, conversationId: string) =>
      once<Message[]>(sessionId, 'messages.list', { conversationId }),
    patchConversation: (
      sessionId: string,
      input: {
        operationId: string;
        id: string;
        title: { expectedRevision: number; value: string };
      },
    ) => once<Conversation>(sessionId, 'conversations.patch', input),
    reopen: (sessionId: string) => once<{ reopened: true }>(sessionId, 'reopen', {}),
    patchSource: (sessionId: string, input: SourcePatch) =>
      once<SourceReading>(sessionId, 'sources.patch', input),
    redeliverSource: (sessionId: string, operationId: string) =>
      once<SourceReading>(sessionId, 'sources.redeliver', { operationId }),
    purgeManuscript: (sessionId: string, id: string) =>
      once<{ id: string }>(sessionId, 'manuscripts.purge', { id }),
    finishMediaCleanup: (sessionId: string, id: string, operationId: string) =>
      once<MediaCleanup>(sessionId, 'media.finishCleanup', { id, operationId }),
    listMedia: (sessionId: string) => once<Media[]>(sessionId, 'media.list', {}),
    reregisterMedia: (sessionId: string, input: { relpath: string; duration: number }) =>
      once<{ status: 'created'; id: string } | { status: 'choose'; ids: string[] }>(
        sessionId,
        'media.reregister',
        input,
      ),
    restoreRegisteredMedia: (sessionId: string, id: string) =>
      once<{ id: string }>(sessionId, 'media.restoreRegistered', { id }),
    listAcceptableRuns: (sessionId: string, manuscriptId: string) =>
      once<AcceptableRun[]>(sessionId, 'modelRuns.listAcceptable', { manuscriptId }),
    previewModelRun: (
      sessionId: string,
      input: { runId: string; candidates: PreviewCandidateInput[] },
    ) =>
      once<{ pendingCount: number; timeMappingRevision: number; candidates: PreviewCandidate[] }>(
        sessionId,
        'modelRuns.preview',
        input,
      ),
    acceptModelRun: (
      sessionId: string,
      input: {
        operationId: string;
        runId: string;
        chunkIndex: number;
        segmentIndex: number;
        mediaStart: number;
        mediaEnd: number;
        timeMappingRevision: number;
        targetFingerprint: string;
        text: string;
      },
    ) => once<TranscriptionAcceptance>(sessionId, 'modelRuns.accept', input),
    listAttachments: (sessionId: string, lexemeId: string) =>
      once<AttachmentLinkView[]>(sessionId, 'attachments.list', { lexemeId }),
    publishAttachment: (
      sessionId: string,
      input: {
        lexemeId: string;
        displayName: string;
        kind: 'image' | 'audio' | 'document';
        mimeType: string;
        bytes: Uint8Array;
        operationId: string;
      },
    ) => once<unknown>(sessionId, 'attachments.publish', input),
    removeAttachmentLink: (sessionId: string, linkId: string) =>
      once<unknown>(sessionId, 'attachments.removeLink', { linkId }),
  };
}
