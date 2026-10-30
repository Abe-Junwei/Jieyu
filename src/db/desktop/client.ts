import type { BridgeCreate, LanguageEnsure, OrthographyCreate } from './catalog';
import type { DesktopOperations } from './operationContract';
import type { LayerCreate } from './layers';
import type { LexemeLinkWrite, LexemeSave } from './lexicon';
import type { MediaCreate } from './media';
import type { ManuscriptCreate } from './manuscripts';
import type { AnalysisCredentials } from './analysisRestore';
import type { SourcePatch } from './sourceFields';
import type { CorpusQueryCursor } from './corpusQuery';
import type { ConversationCreate } from './conversations';
import type { MessageAppend } from './messages';
import type { UnitCreate } from './units';
import type { ContentNoteQuery, ContentNoteWrite } from './notes';
import type { PreviewCandidateInput } from './modelRuns';

export interface DesktopBridge {
  desktopCall(sessionId: string, method: string, args: unknown): Promise<unknown>;
}

/** One bridge call per action. A lost response is returned as a failure and is not sent again. */
export function createDesktopClient(bridge: DesktopBridge) {
  function once<K extends keyof DesktopOperations>(
    sessionId: string,
    method: K,
    args: unknown,
  ): Promise<DesktopOperations[K]['output']> {
    return bridge.desktopCall(sessionId, method, args) as Promise<DesktopOperations[K]['output']>;
  }
  return {
    createMedia: (sessionId: string, input: MediaCreate) => once(sessionId, 'media.create', input),
    createManuscript: (sessionId: string, input: ManuscriptCreate) =>
      once(sessionId, 'manuscripts.create', input),
    createLayer: (sessionId: string, input: LayerCreate) => once(sessionId, 'layers.create', input),
    createUnit: (sessionId: string, input: UnitCreate) => once(sessionId, 'units.create', input),
    getUnit: (sessionId: string, id: string) => once(sessionId, 'units.get', { id }),
    listManuscripts: (sessionId: string) => once(sessionId, 'manuscripts.list', {}),
    getProject: (sessionId: string) => once(sessionId, 'project.get', {}),
    importFile: (sessionId: string, input: { file: string; roles?: string }) =>
      once(sessionId, 'exchange.importFile', input),
    exportJyt: (sessionId: string, input: { file: string }) =>
      once(sessionId, 'exchange.exportJyt', input),
    exportJym: (sessionId: string, input: { file: string }) =>
      once(sessionId, 'exchange.exportJym', input),
    exportManuscript: (sessionId: string, input: { file: string; manuscriptId: string }) =>
      once(sessionId, 'exchange.exportManuscript', input),
    previewManuscriptDelete: (sessionId: string, id: string) =>
      once(sessionId, 'manuscripts.previewDelete', { id }),
    deleteManuscript: (sessionId: string, id: string) =>
      once(sessionId, 'manuscripts.delete', { id }),
    listDueReminders: (sessionId: string) => once(sessionId, 'deletion.listDue', {}),
    showManuscriptReminder: (sessionId: string, id: string) =>
      once(sessionId, 'manuscripts.showReminder', { id }),
    showRecordingReminder: (sessionId: string, id: string) =>
      once(sessionId, 'media.showReminder', { id }),
    listLayers: (sessionId: string, manuscriptId: string) =>
      once(sessionId, 'layers.list', { manuscriptId }),
    listUnits: (sessionId: string, layerId: string) => once(sessionId, 'units.list', { layerId }),
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
    ) => once(sessionId, 'corpus.query', input),
    updateUnitText: (sessionId: string, input: { unitId: string; text: string }) =>
      once(sessionId, 'units.updateText', input),
    undoUnitText: (sessionId: string) => once(sessionId, 'units.undoText', {}),
    undoStep: (sessionId: string) => once(sessionId, 'units.undo', {}),
    splitUnit: (sessionId: string, input: { unitId: string; time: number }) =>
      once(sessionId, 'units.split', input),
    mergeUnits: (sessionId: string, input: { keepId: string; removeId: string }) =>
      once(sessionId, 'units.merge', input),
    updateBoundary: (sessionId: string, input: { leftId: string; rightId: string; time: number }) =>
      once(sessionId, 'units.updateBoundary', input),
    createCustomFieldDefinition: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.createDefinition', input),
    updateCustomFieldDefinition: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.updateDefinition', input),
    addCustomFieldOption: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.addOption', input),
    updateCustomFieldOptionLabel: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.updateOptionLabel', input),
    importCustomFieldDefinition: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.importDefinition', input),
    previewUnitValue: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.previewUnitValue', input),
    setUnitValue: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.setUnitValue', input),
    removeUnitValue: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.removeUnitValue', input),
    missingUnitFields: (sessionId: string, unitId: string) =>
      once(sessionId, 'customFields.missingUnitFields', { unitId }),
    previewFieldValue: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.previewValue', input),
    setFieldValue: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.setValue', input),
    removeFieldValue: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.removeValue', input),
    missingFields: (sessionId: string, targetType: string, targetId: string, lexemeId?: string) =>
      once(sessionId, 'customFields.missingFields', {
        targetType,
        targetId,
        ...(lexemeId === undefined ? {} : { lexemeId }),
      }),
    listCustomFieldDefinitions: (sessionId: string) =>
      once(sessionId, 'customFields.listDefinitions', {}),
    listLexemeLinks: (sessionId: string) => once(sessionId, 'references.listLinks', {}),
    locateFieldValues: (sessionId: string, definitionId: string) =>
      once(sessionId, 'customFields.locateValues', { definitionId }),
    previewCustomFieldMigration: (sessionId: string, definitionId: string) =>
      once(sessionId, 'customFields.previewMigration', {
        definitionId,
      }),
    migrateCustomFieldDefinition: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.migrateDefinition', input),
    previewCustomFieldPurge: (sessionId: string, definitionId: string) =>
      once(sessionId, 'customFields.previewPurge', { definitionId }),
    purgeCustomFieldDefinition: (sessionId: string, input: unknown) =>
      once(sessionId, 'customFields.purgeDefinition', input),
    setTimeMapping: (
      sessionId: string,
      input: {
        manuscriptId: string;
        expectedRevision: number;
        offsetSec: number;
        scale: number;
        sourceMediaId?: string;
      },
    ) => once(sessionId, 'manuscripts.setTimeMapping', input),
    rollbackTimeMapping: (
      sessionId: string,
      input: { manuscriptId: string; expectedRevision: number },
    ) => once(sessionId, 'manuscripts.rollbackTimeMapping', input),
    ensureProjectDefinition: (sessionId: string, input: LanguageEnsure) =>
      once(sessionId, 'catalog.ensureProjectDefinition', input),
    getLanguage: (sessionId: string, id: string) => once(sessionId, 'catalog.getLanguage', { id }),
    createOrthography: (sessionId: string, input: OrthographyCreate) =>
      once(sessionId, 'orthographies.create', input),
    createBridge: (sessionId: string, input: BridgeCreate) =>
      once(sessionId, 'bridges.create', input),
    getBridge: (sessionId: string, id: string) => once(sessionId, 'bridges.get', { id }),
    listLanguages: (sessionId: string) => once(sessionId, 'catalog.listLanguages', {}),
    updateLanguage: (sessionId: string, input: { id: string; locale: string; value: string }) =>
      once(sessionId, 'catalog.updateLanguage', input),
    listOrthographies: (sessionId: string, languageId: string) =>
      once(sessionId, 'orthographies.list', { languageId }),
    updateOrthography: (sessionId: string, input: { id: string; scriptTag: string }) =>
      once(sessionId, 'orthographies.update', input),
    listBridges: (sessionId: string) => once(sessionId, 'bridges.list', {}),
    updateBridge: (sessionId: string, input: { id: string; rules: Record<string, unknown> }) =>
      once(sessionId, 'bridges.update', input),
    createSpeaker: (sessionId: string, input: { name: string }) =>
      once(sessionId, 'speakers.create', input),
    listSpeakers: (sessionId: string) => once(sessionId, 'speakers.list', {}),
    assignSpeaker: (sessionId: string, input: { speakerId: string; unitIds: string[] }) =>
      once(sessionId, 'speakers.assign', input),
    patchSpeaker: (sessionId: string, input: unknown) => once(sessionId, 'speakers.patch', input),
    saveLexemeEntry: (sessionId: string, input: LexemeSave) =>
      once(sessionId, 'lexicon.saveEntry', input),
    getLexemeEntry: (sessionId: string, id: string) => once(sessionId, 'lexicon.getEntry', { id }),
    linkSense: (sessionId: string, input: LexemeLinkWrite & { lexemeId: string }) =>
      once(sessionId, 'lexicon.linkSense', input),
    removeSense: (sessionId: string, input: { lexemeId: string; senseId: string }) =>
      once(sessionId, 'lexicon.removeSense', input),
    listLinkCandidates: (sessionId: string) => once(sessionId, 'lexicon.listLinkCandidates', {}),
    matchLexemeLink: (sessionId: string, query: string) =>
      once(sessionId, 'lexicon.matchLink', { query }),
    listTokenLinks: (sessionId: string, unitId: string) =>
      once(sessionId, 'lexicon.listTokenLinks', { unitId }),
    replaceTokenLink: (
      sessionId: string,
      input: { tokenId: string; lexemeId: string; senseId: string },
    ) => once(sessionId, 'lexicon.replaceTokenLink', input),
    createLinkedLexeme: (
      sessionId: string,
      input: { targetId: string; headword: string; translation: string },
    ) => once(sessionId, 'lexicon.createLinkedEntry', input),
    clearTokenLink: (sessionId: string, tokenId: string) =>
      once(sessionId, 'lexicon.clearTokenLink', { tokenId }),
    createNote: (sessionId: string, input: ContentNoteWrite) =>
      once(sessionId, 'notes.create', input),
    updateNote: (
      sessionId: string,
      input: {
        id: string;
        content?: Record<string, string>;
        category?: ContentNoteWrite['category'];
      },
    ) => once(sessionId, 'notes.update', input),
    deleteNote: (sessionId: string, id: string) => once(sessionId, 'notes.delete', { id }),
    listNotes: (sessionId: string, input: ContentNoteQuery = {}) =>
      once(sessionId, 'notes.list', input),
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
    ) => once(sessionId, 'notes.saveLexeme', input),
    listLexemeNotes: (sessionId: string, lexemeId: string) =>
      once(sessionId, 'notes.listLexeme', { lexemeId }),
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
    ) => once(sessionId, 'analysis.apply', input),
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
    ) => once(sessionId, 'analysis.import', input),
    readAnalysisState: (sessionId: string, unitId: string) =>
      once(sessionId, 'analysis.readState', { unitId }),
    listCandidates: (sessionId: string, unitId: string) =>
      once(sessionId, 'analysis.listCandidates', { unitId }),
    listWords: (sessionId: string, unitId: string) =>
      once(sessionId, 'analysis.listWords', { unitId }),
    segmentWords: (sessionId: string, unitId: string) =>
      once(sessionId, 'analysis.segmentWords', { unitId }),
    listMorphemes: (sessionId: string, unitId: string) =>
      once(sessionId, 'analysis.listMorphemes', {
        unitId,
      }),
    segmentMorphemes: (sessionId: string, unitId: string) =>
      once(sessionId, 'analysis.segmentMorphemes', { unitId }),
    submitAnalysis: (
      sessionId: string,
      input: {
        unitId: string;
        graph: unknown;
        expected: AnalysisCredentials;
        definitionRevisions: { definitionId: string; revision: number }[];
      },
    ) => once(sessionId, 'analysis.submit', input),
    acceptAnalysis: (
      sessionId: string,
      input: { candidateId: string; expected: AnalysisCredentials },
    ) => once(sessionId, 'analysis.accept', input),
    restoreAnalysis: (
      sessionId: string,
      input: { candidateId: string; expected: AnalysisCredentials; conversions?: unknown[] },
    ) => once(sessionId, 'analysis.restore', input),
    splitAnalysisNode: (
      sessionId: string,
      input: {
        unitId: string;
        nodeId: string;
        into: [unknown, unknown];
        expected: AnalysisCredentials;
      },
    ) => once(sessionId, 'analysis.split', input),
    mergeAnalysisNodes: (
      sessionId: string,
      input: {
        unitId: string;
        nodeIds: [string, string];
        into: unknown;
        expected: AnalysisCredentials;
      },
    ) => once(sessionId, 'analysis.merge', input),
    createConversation: (
      sessionId: string,
      title: string,
      fieldValues?: ConversationCreate['fieldValues'],
    ) =>
      once(sessionId, 'conversations.create', {
        title,
        ...(fieldValues === undefined ? {} : { fieldValues }),
      }),
    listConversations: (sessionId: string) => once(sessionId, 'conversations.list', {}),
    appendMessage: (sessionId: string, input: MessageAppend) =>
      once(sessionId, 'messages.append', input),
    listMessages: (sessionId: string, conversationId: string) =>
      once(sessionId, 'messages.list', { conversationId }),
    patchConversation: (
      sessionId: string,
      input: {
        operationId: string;
        id: string;
        title: { expectedRevision: number; value: string };
      },
    ) => once(sessionId, 'conversations.patch', input),
    reopen: (sessionId: string) =>
      bridge.desktopCall(sessionId, 'reopen', {}) as Promise<{ reopened: true }>,
    patchSource: (sessionId: string, input: SourcePatch) => once(sessionId, 'sources.patch', input),
    redeliverSource: (sessionId: string, operationId: string) =>
      once(sessionId, 'sources.redeliver', { operationId }),
    purgeManuscript: (sessionId: string, id: string) =>
      once(sessionId, 'manuscripts.purge', { id }),
    finishMediaCleanup: (sessionId: string, id: string, operationId: string) =>
      once(sessionId, 'media.finishCleanup', { id, operationId }),
    listMedia: (sessionId: string) => once(sessionId, 'media.list', {}),
    reregisterMedia: (sessionId: string, input: { relpath: string; duration: number }) =>
      once(sessionId, 'media.reregister', input),
    restoreRegisteredMedia: (sessionId: string, id: string) =>
      once(sessionId, 'media.restoreRegistered', { id }),
    listAcceptableRuns: (sessionId: string, manuscriptId: string) =>
      once(sessionId, 'modelRuns.listAcceptable', { manuscriptId }),
    previewModelRun: (
      sessionId: string,
      input: { runId: string; candidates: PreviewCandidateInput[] },
    ) => once(sessionId, 'modelRuns.preview', input),
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
    ) => once(sessionId, 'modelRuns.accept', input),
    listAttachments: (sessionId: string, lexemeId: string) =>
      once(sessionId, 'attachments.list', { lexemeId }),
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
    ) => once(sessionId, 'attachments.publish', input),
    removeAttachmentLink: (sessionId: string, linkId: string) =>
      once(sessionId, 'attachments.removeLink', { linkId }),
  };
}
