import type { BridgeCreate, LanguageEnsure, OrthographyCreate } from './catalog';
import type { EditInspection, EditReceiptKind } from './editReceipts';
import type { DesktopOperations } from './operationContract';
import type { LayerCreate } from './layers';
import type { LexemeLinkWrite, LexemeSave } from './lexicon';
import type { MediaCreate } from './media';
import type { RecordingRegistration } from './registerRecording';
import type { ManuscriptCreate } from './manuscripts';
import type { AnalysisCredentials } from './analysisRestore';
import type { SourceCreate, SourcePatch } from './sourceFields';
import type { CorpusQueryCursor } from './corpusQuery';
import type { ConversationCreate } from './conversations';
import type { MessageAppend } from './messages';
import type { UnitCreate } from './units';
import type { ContentNoteQuery, ContentNoteWrite } from './notes';
import type { PreviewCandidateInput } from './modelRuns';

export interface DesktopBridge {
  desktopCall(sessionId: string, method: string, args: unknown): Promise<unknown>;
}

type EditMethod =
  | 'units.create'
  | 'units.moveEdge'
  | 'units.moveSharedBoundary'
  | 'units.moveUnit'
  | 'units.delete'
  | 'units.deleteMany'
  | 'units.undo'
  | 'units.redo';

const EDIT_KINDS: Record<EditMethod, EditReceiptKind> = {
  'units.create': 'create',
  'units.moveEdge': 'moveEdge',
  'units.moveSharedBoundary': 'moveSharedBoundary',
  'units.moveUnit': 'moveUnit',
  'units.delete': 'delete',
  'units.deleteMany': 'deleteMany',
  'units.undo': 'undo',
  'units.redo': 'redo',
};

/** ADR-0129: the edit may or may not have committed, and the library could not say which. */
export const EDIT_OUTCOME_UNKNOWN = 'edit outcome is unknown';

/**
 * One bridge call per action. A lost response is returned as a failure and is not sent again,
 * except for receipted edits (ADR-0129), which ask the library by operation id first.
 */
export function createDesktopClient(bridge: DesktopBridge) {
  async function once<K extends keyof DesktopOperations>(
    sessionId: string,
    method: K,
    args: unknown,
  ): Promise<DesktopOperations[K]['output']> {
    return (await bridge.desktopCall(sessionId, method, args)) as DesktopOperations[K]['output'];
  }
  /** committed → stored result; not-submitted → one retry with the same id; otherwise unknown. */
  async function receipted<K extends EditMethod>(
    sessionId: string,
    method: K,
    payload: Record<string, unknown>,
  ): Promise<DesktopOperations[K]['output']> {
    const operationId = globalThis.crypto.randomUUID();
    const args = { ...payload, operationId };
    try {
      return await once(sessionId, method, args);
    } catch (error) {
      let found: EditInspection;
      try {
        found = await once(sessionId, 'units.inspectEdit', {
          operationId,
          kind: EDIT_KINDS[method],
          payload,
        });
      } catch {
        throw new Error(EDIT_OUTCOME_UNKNOWN, { cause: error });
      }
      if (found.status === 'committed') return found.result as DesktopOperations[K]['output'];
      if (found.status === 'not-submitted') return once(sessionId, method, args);
      throw new Error(EDIT_OUTCOME_UNKNOWN, { cause: error });
    }
  }
  return {
    createMedia: (sessionId: string, input: MediaCreate) => once(sessionId, 'media.create', input),
    registerRecording: (sessionId: string, input: RecordingRegistration) =>
      once(sessionId, 'recordings.register', input),
    createManuscript: (sessionId: string, input: ManuscriptCreate) =>
      once(sessionId, 'manuscripts.create', input),
    createLayer: (sessionId: string, input: LayerCreate) => once(sessionId, 'layers.create', input),
    createUnit: (sessionId: string, input: UnitCreate) =>
      receipted(sessionId, 'units.create', { ...input }),
    getUnit: (sessionId: string, id: string) => once(sessionId, 'units.get', { id }),
    listManuscripts: (sessionId: string) => once(sessionId, 'manuscripts.list', {}),
    getProject: (sessionId: string) => once(sessionId, 'project.get', {}),
    importFile: (sessionId: string, input: { grantId: string; rolesGrantId?: string }) =>
      once(sessionId, 'exchange.importFile', input),
    exportJyt: (sessionId: string, input: { grantId: string }) =>
      once(sessionId, 'exchange.exportJyt', input),
    exportJym: (sessionId: string, input: { grantId: string }) =>
      once(sessionId, 'exchange.exportJym', input),
    exportManuscript: (sessionId: string, input: { grantId: string; manuscriptId: string }) =>
      once(sessionId, 'exchange.exportManuscript', input),
    previewManuscriptDelete: (sessionId: string, id: string) =>
      once(sessionId, 'manuscripts.previewDelete', { id }),
    deleteManuscript: (sessionId: string, id: string) =>
      once(sessionId, 'manuscripts.delete', { id }),
    listDueReminders: (sessionId: string) => once(sessionId, 'deletion.listDue', {}),
    showManuscriptReminder: (sessionId: string, id: string) =>
      once(sessionId, 'manuscripts.showReminder', { id }),
    retimeManuscript: (
      sessionId: string,
      input: { manuscriptId: string; offsetMs: number; scale: number },
    ) => once(sessionId, 'manuscripts.retime', input),
    showRecordingReminder: (sessionId: string, id: string) =>
      once(sessionId, 'media.showReminder', { id }),
    listLayers: (sessionId: string, manuscriptId: string) =>
      once(sessionId, 'layers.list', { manuscriptId }),
    listLayerLinks: (sessionId: string, manuscriptId: string) =>
      once(sessionId, 'layers.listLinks', { manuscriptId }),
    previewLayerHosts: (
      sessionId: string,
      input: {
        layerId: string;
        hostLayerIds: string[];
        preferredHostLayerId: string;
        linkType: 'direct' | 'free' | 'literal' | 'pedagogical';
      },
    ) => once(sessionId, 'layers.previewHosts', input),
    setLayerHosts: (
      sessionId: string,
      input: {
        layerId: string;
        hostLayerIds: string[];
        preferredHostLayerId: string;
        linkType: 'direct' | 'free' | 'literal' | 'pedagogical';
        append?: boolean;
      },
    ) => once(sessionId, 'layers.setHosts', input),
    clearLayerHosts: (sessionId: string, input: { layerId: string; sortOrder: number }) =>
      once(sessionId, 'layers.clearHosts', input),
    placeLayer: (
      sessionId: string,
      input: { layerId: string; hostLayerId?: string; beforeId?: string },
    ) => once(sessionId, 'layers.place', input),
    renameLayer: (sessionId: string, input: { id: string; name: Record<string, string> }) =>
      once(sessionId, 'layers.rename', input),
    setLayerHeight: (sessionId: string, input: { id: string; laneHeight: number }) =>
      once(sessionId, 'layers.setHeight', input),
    setLayerStyle: (
      sessionId: string,
      input: {
        id: string;
        orthographyId: string | null;
        displayFont: string | null;
        displayFontSize: number | null;
        displayBold: boolean;
        displayItalic: boolean;
        reset?: boolean;
      },
    ) => once(sessionId, 'layers.setStyle', input),
    moveLayer: (sessionId: string, input: { id: string; direction: 'up' | 'down' }) =>
      once(sessionId, 'layers.move', input),
    deleteLayer: (
      sessionId: string,
      input: { id: string; mode: 'soft' | 'migrate' | 'purge'; targetLayerId?: string },
    ) => once(sessionId, 'layers.delete', input),
    listDeletedLayers: (sessionId: string) => once(sessionId, 'layers.listDeleted', {}),
    restoreLayer: (sessionId: string, id: string) => once(sessionId, 'layers.restore', { id }),
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
    setUnitSkipProcessing: (sessionId: string, input: { unitId: string; skip: boolean }) =>
      once(sessionId, 'units.setSkipProcessing', input),
    updateUnitText: (
      sessionId: string,
      input: { unitId: string; textLayerId?: string; text: string; operationId?: string },
    ) => once(sessionId, 'units.updateText', input),
    readTextDraft: (sessionId: string, unitId: string, textLayerId?: string) =>
      once(sessionId, 'units.readTextDraft', layerScoped(unitId, textLayerId)),
    inspectTextSave: (
      sessionId: string,
      input: { operationId: string; unitId: string; textLayerId?: string; text: string },
    ) => once(sessionId, 'units.inspectTextSave', input),
    putTextDraft: (
      sessionId: string,
      input: { unitId: string; textLayerId?: string; rawInput: string; baseBody: string },
    ) => once(sessionId, 'units.putTextDraft', input),
    discardTextDraft: (sessionId: string, unitId: string, textLayerId?: string) =>
      once(sessionId, 'units.discardTextDraft', layerScoped(unitId, textLayerId)),
    undoUnitText: (sessionId: string) => once(sessionId, 'units.undoText', {}),
    undoStep: (sessionId: string, manuscriptId?: string) =>
      receipted(sessionId, 'units.undo', manuscriptId === undefined ? {} : { manuscriptId }),
    redoStep: (sessionId: string, manuscriptId?: string) =>
      receipted(sessionId, 'units.redo', manuscriptId === undefined ? {} : { manuscriptId }),
    dropUndoStep: (sessionId: string, manuscriptId?: string) =>
      once(sessionId, 'units.dropUndo', manuscriptId === undefined ? {} : { manuscriptId }),
    dropRedoStep: (sessionId: string, manuscriptId?: string) =>
      once(sessionId, 'units.dropRedo', manuscriptId === undefined ? {} : { manuscriptId }),
    splitUnit: (sessionId: string, input: { unitId: string; time: number }) =>
      once(sessionId, 'units.split', input),
    mergeUnits: (sessionId: string, input: { keepId: string; removeId: string }) =>
      once(sessionId, 'units.merge', input),
    updateBoundary: (sessionId: string, input: { leftId: string; rightId: string; time: number }) =>
      once(sessionId, 'units.updateBoundary', input),
    moveUnitEdge: (
      sessionId: string,
      input: { unitId: string; edge: 'start' | 'end'; time: number },
    ) => receipted(sessionId, 'units.moveEdge', { ...input }),
    moveSharedBoundary: (
      sessionId: string,
      input: { leftId: string; rightId: string; time: number },
    ) => receipted(sessionId, 'units.moveSharedBoundary', { ...input }),
    moveUnit: (sessionId: string, input: { unitId: string; delta: number }) =>
      receipted(sessionId, 'units.moveUnit', { ...input }),
    previewUnitDelete: (sessionId: string, unitId: string) =>
      once(sessionId, 'units.deletePreview', { unitId }),
    previewUnitsDelete: (sessionId: string, unitIds: string[]) =>
      once(sessionId, 'units.deleteManyPreview', { unitIds }),
    deleteUnit: (sessionId: string, unitId: string) =>
      receipted(sessionId, 'units.delete', { unitId }),
    deleteUnits: (sessionId: string, unitIds: string[]) =>
      receipted(sessionId, 'units.deleteMany', { unitIds }),
    readTimeDraft: (sessionId: string, unitId: string) =>
      once(sessionId, 'units.readTimeDraft', { unitId }),
    putTimeDraft: (
      sessionId: string,
      input: {
        unitId: string;
        edge: 'start' | 'end';
        rawInput: string;
        baseMs: number;
        issue: string | null;
      },
    ) => once(sessionId, 'units.putTimeDraft', input),
    discardTimeDraft: (sessionId: string, unitId: string, edge?: 'start' | 'end') =>
      once(sessionId, 'units.discardTimeDraft', edge === undefined ? { unitId } : { unitId, edge }),
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
    clearSpeaker: (sessionId: string, input: { unitIds: string[] }) =>
      once(sessionId, 'speakers.clear', input),
    listLaneLocks: (sessionId: string, manuscriptId: string) =>
      once(sessionId, 'layers.listLaneLocks', { manuscriptId }),
    replaceLaneLocks: (
      sessionId: string,
      input: { layerId: string; locks: { speakerId: string; laneIndex: number }[] },
    ) => once(sessionId, 'layers.replaceLaneLocks', input),
    clearLaneLocks: (sessionId: string, input: { layerId: string; speakerIds: string[] }) =>
      once(sessionId, 'layers.clearLaneLocks', input),
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
    reopen: async (sessionId: string) =>
      (await bridge.desktopCall(sessionId, 'reopen', {})) as { reopened: true },
    createSource: (sessionId: string, input: SourceCreate) =>
      once(sessionId, 'sources.create', input),
    patchSource: (sessionId: string, input: SourcePatch) => once(sessionId, 'sources.patch', input),
    redeliverSource: (sessionId: string, operationId: string) =>
      once(sessionId, 'sources.redeliver', { operationId }),
    purgeManuscript: (sessionId: string, id: string) =>
      once(sessionId, 'manuscripts.purge', { id }),
    finishMediaCleanup: (sessionId: string, id: string, operationId: string) =>
      once(sessionId, 'media.finishCleanup', { id, operationId }),
    listDeletedManuscripts: (sessionId: string) => once(sessionId, 'manuscripts.listDeleted', {}),
    listDeletedMedia: (sessionId: string) => once(sessionId, 'media.listDeleted', {}),
    restoreManuscript: (sessionId: string, id: string) =>
      once(sessionId, 'manuscripts.restore', { id }),
    listMedia: (sessionId: string) => once(sessionId, 'media.list', {}),
    reregisterMedia: (sessionId: string, input: { relpath: string; duration: number }) =>
      once(sessionId, 'media.reregister', input),
    restoreRegisteredMedia: (sessionId: string, id: string) =>
      once(sessionId, 'media.restoreRegistered', { id }),
    readModelRunAcceptance: (sessionId: string, operationId: string) =>
      once(sessionId, 'modelRuns.readAcceptance', { operationId }),
    abandonModelRun: (sessionId: string, runId: string) =>
      once(sessionId, 'modelRuns.abandon', { runId }),
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
        targetFingerprint: string;
        text: string;
      },
    ) => once(sessionId, 'modelRuns.accept', input),
    listAttachments: (sessionId: string, lexemeId: string) =>
      once(sessionId, 'attachments.list', { lexemeId }),
    readAttachment: (sessionId: string, linkId: string) =>
      once(sessionId, 'attachments.read', { linkId }),
    finishAttachmentCleanup: (sessionId: string, fileId: string) =>
      once(sessionId, 'attachments.finishCleanup', { fileId }),
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

function layerScoped(
  unitId: string,
  textLayerId?: string,
): { unitId: string; textLayerId?: string } {
  return textLayerId === undefined ? { unitId } : { unitId, textLayerId };
}
