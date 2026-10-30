import {
  finishAttachmentCleanup,
  listAttachmentLinks,
  publishAttachment,
  readAttachmentLink,
  removeAttachmentLink,
} from './attachments';
import { applyAnalysis } from './analysis';
import { importForeignFile } from './foreignImport';
import { getProjectIdentity } from './projectIdentity';
import {
  assertExportTarget,
  exportDesktopJym,
  exportDesktopJyt,
  exportDesktopManuscriptJyt,
  saveDesktopPackage,
} from './projectExchange';
import { queryCorpus } from './corpusQuery';
import { importAnalysis } from './analysisImport';
import { listAnalysisCandidates } from './analysisCandidates';
import {
  acceptAnalysis,
  listUnitMorphemes,
  listUnitWords,
  mergeAnalysisNodes,
  readAnalysisState,
  restoreAnalysis,
  segmentUnitMorphemes,
  segmentUnitWords,
  splitAnalysisNode,
  submitAnalysis,
} from './analysisRestore';
import {
  createBridge,
  createOrthography,
  ensureProjectLanguage,
  getBridge,
  getProjectLanguage,
  listBridges,
  listOrthographies,
  listProjectLanguages,
  updateBridge,
  updateOrthography,
  updateProjectLanguage,
} from './catalog';
import {
  addOption,
  createDefinition,
  importDefinition,
  listDefinitions,
  locateCustomFieldValues,
  missingFields,
  missingUnitFields,
  previewFieldValue,
  previewUnitValue,
  removeFieldValue,
  removeUnitValue,
  setFieldValue,
  setUnitValue,
  updateDefinition,
  updateOptionLabel,
} from './customFields';
import { migrateDefinition, previewMigration } from './customFieldMigration';
import { readLexemeLinks } from './referenceState';
import { patchBibliography, redeliverBibliography } from './bibliographyFields';
import { patchConversation, redeliverConversation } from './conversationFields';
import { assignSpeaker } from './speakerAssign';
import { patchSpeaker, redeliverSpeaker } from './speakerFields';
import { createSpeaker, listSpeakers } from './speakers';
import { createSource, patchSource, redeliverSource } from './sourceFields';
import { previewPurge, purgeDefinition } from './customFieldPurge';
import { createLayer, listLayers } from './layers';
import { linkSense, removeSense, saveLexemeEntry, getLexemeEntry } from './lexicon';
import {
  clearTokenLexemeLink,
  createLinkedLexeme,
  listLexemeLinkCandidates,
  listTokenLexemeLinks,
  matchLexemeLinkQuery,
  replaceTokenLexemeLink,
} from './lexemeLink';
import { createMedia, listActiveMedia, listDeletedMedia } from './media';
import { finishMediaCleanup, type MediaTrash } from './mediaCleanup';
import { reregisterMedia, restoreRegisteredMedia } from './mediaReregister';
import {
  abandonPending,
  acceptTranscriptionCandidate,
  finishModelRun,
  getModelRun,
  interruptUnfinishedRuns,
  listAcceptableRuns,
  stopManuscriptTasks,
  stopRecordingTasks,
  previewModelRun,
  readTranscriptionAcceptance,
  startModelRun,
} from './modelRuns';
import {
  createContentNote,
  deleteContentNote,
  listContentNotes,
  listLexemeNotes,
  saveLexemeNote,
  updateContentNote,
} from './notes';
import { createConversation, listConversations } from './conversations';
import {
  appendMessage,
  clearConversationMessages,
  listMessages,
  updateMessageBody,
} from './messages';
import { listDueDeletionReminders, purgeManuscript, showDeletionReminder } from './manuscriptPurge';
import {
  createManuscript,
  deleteManuscript,
  deleteRecording,
  listDeletedManuscripts,
  listManuscripts,
  previewManuscriptDelete,
  previewRecordingDelete,
  restoreManuscript,
  rollbackManuscriptTimeMapping,
  setManuscriptTimeMapping,
} from './manuscripts';
import {
  desktopSessionFolder,
  reopenDesktopSession,
  requireDesktopSession,
} from './projectSession';
import { clearSessionEdit, rememberSessionEdit, undoSessionEdit } from './sessionEdit';
import { desktopOperations, isDesktopOperation, type DesktopOperations } from './operationContract';
import {
  createUnit,
  getUnit,
  listUnits,
  updateBoundary,
  updateUnitText,
  type UnitTextUndo,
} from './units';
import { mergeUnits, splitUnit } from './unitSpan';

type ContractCtx = {
  db: ReturnType<typeof requireDesktopSession>['db'];
  folder: string;
  sessionId: string;
  trash?: MediaTrash;
};

type ContractHandlers = {
  [K in keyof DesktopOperations]: DesktopOperations[K]['undo'] extends 'replace-on-success'
    ? {
        run: (
          ctx: ContractCtx,
          input: ReturnType<DesktopOperations[K]['check']>,
        ) => { value: DesktopOperations[K]['output']; undo: UnitTextUndo | null };
        remember: (sessionId: string, undo: UnitTextUndo) => void;
      }
    : {
        run: (
          ctx: ContractCtx,
          input: ReturnType<DesktopOperations[K]['check']>,
        ) => DesktopOperations[K]['output'] | Promise<DesktopOperations[K]['output']>;
      };
};

const operationHandlers = {
  'project.get': {
    run: (ctx: ContractCtx) => getProjectIdentity(ctx.db),
  },
  'layers.create': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.create']['check']>) =>
      createLayer(ctx.db, input),
  },
  'layers.list': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.list']['check']>) =>
      listLayers(ctx.db, input.manuscriptId),
  },
  'catalog.ensureProjectDefinition': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['catalog.ensureProjectDefinition']['check']>,
    ) => ensureProjectLanguage(ctx.db, input),
  },
  'catalog.getLanguage': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['catalog.getLanguage']['check']>) =>
      getProjectLanguage(ctx.db, input.id),
  },
  'catalog.listLanguages': {
    run: (ctx: ContractCtx) => listProjectLanguages(ctx.db),
  },
  'catalog.updateLanguage': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['catalog.updateLanguage']['check']>,
    ) => updateProjectLanguage(ctx.db, input),
  },
  'orthographies.create': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['orthographies.create']['check']>,
    ) => createOrthography(ctx.db, input),
  },
  'orthographies.list': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['orthographies.list']['check']>) =>
      listOrthographies(ctx.db, input.languageId),
  },
  'orthographies.update': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['orthographies.update']['check']>,
    ) => updateOrthography(ctx.db, input),
  },
  'bridges.create': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['bridges.create']['check']>) =>
      createBridge(ctx.db, input),
  },
  'bridges.get': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['bridges.get']['check']>) =>
      getBridge(ctx.db, input.id),
  },
  'bridges.list': {
    run: (ctx: ContractCtx) => listBridges(ctx.db),
  },
  'bridges.update': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['bridges.update']['check']>) =>
      updateBridge(ctx.db, input),
  },
  'lexicon.saveEntry': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['lexicon.saveEntry']['check']>) =>
      saveLexemeEntry(ctx.db, input),
  },
  'lexicon.getEntry': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['lexicon.getEntry']['check']>) =>
      getLexemeEntry(ctx.db, input.id),
  },
  'lexicon.linkSense': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['lexicon.linkSense']['check']>) =>
      linkSense(ctx.db, input),
  },
  'lexicon.removeSense': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['lexicon.removeSense']['check']>) =>
      removeSense(ctx.db, input),
  },
  'lexicon.listLinkCandidates': {
    run: (ctx: ContractCtx) => listLexemeLinkCandidates(ctx.db),
  },
  'lexicon.matchLink': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['lexicon.matchLink']['check']>) =>
      matchLexemeLinkQuery(ctx.db, input.query),
  },
  'lexicon.listTokenLinks': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['lexicon.listTokenLinks']['check']>,
    ) => listTokenLexemeLinks(ctx.db, input.unitId),
  },
  'lexicon.replaceTokenLink': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['lexicon.replaceTokenLink']['check']>,
    ) => replaceTokenLexemeLink(ctx.db, input),
  },
  'lexicon.clearTokenLink': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['lexicon.clearTokenLink']['check']>,
    ) => clearTokenLexemeLink(ctx.db, input.tokenId),
  },
  'lexicon.createLinkedEntry': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['lexicon.createLinkedEntry']['check']>,
    ) => createLinkedLexeme(ctx.db, input),
  },
  'notes.create': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['notes.create']['check']>) =>
      createContentNote(ctx.db, input),
  },
  'notes.update': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['notes.update']['check']>) =>
      updateContentNote(ctx.db, input),
  },
  'notes.delete': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['notes.delete']['check']>) =>
      deleteContentNote(ctx.db, input.id),
  },
  'notes.list': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['notes.list']['check']>) =>
      listContentNotes(ctx.db, input),
  },
  'notes.saveLexeme': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['notes.saveLexeme']['check']>) =>
      saveLexemeNote(ctx.db, input),
  },
  'notes.listLexeme': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['notes.listLexeme']['check']>) =>
      listLexemeNotes(ctx.db, input.lexemeId),
  },
  'modelRuns.listAcceptable': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['modelRuns.listAcceptable']['check']>,
    ) => listAcceptableRuns(ctx.db, input.manuscriptId),
  },
  'modelRuns.start': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['modelRuns.start']['check']>) =>
      startModelRun(ctx.db, input),
  },
  'modelRuns.finish': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['modelRuns.finish']['check']>) =>
      finishModelRun(ctx.db, input),
  },
  'modelRuns.preview': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['modelRuns.preview']['check']>) =>
      previewModelRun(ctx.db, input),
  },
  'modelRuns.accept': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['modelRuns.accept']['check']>) =>
      acceptTranscriptionCandidate(ctx.db, input),
  },
  'modelRuns.abandon': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['modelRuns.abandon']['check']>) =>
      abandonPending(ctx.db, input.runId),
  },
  'modelRuns.interrupt': {
    run: (ctx: ContractCtx) => interruptUnfinishedRuns(ctx.db),
  },
  'modelRuns.stopManuscript': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['modelRuns.stopManuscript']['check']>,
    ) => stopManuscriptTasks(ctx.db, input.id),
  },
  'modelRuns.stopRecording': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['modelRuns.stopRecording']['check']>,
    ) => stopRecordingTasks(ctx.db, input.id),
  },
  'modelRuns.get': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['modelRuns.get']['check']>) =>
      getModelRun(ctx.db, input.runId),
  },
  'modelRuns.readAcceptance': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['modelRuns.readAcceptance']['check']>,
    ) => readTranscriptionAcceptance(ctx.db, input.operationId),
  },
  'corpus.query': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['corpus.query']['check']>) =>
      queryCorpus(ctx.db, input),
  },
  'units.create': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.create']['check']>) =>
      createUnit(ctx.db, input),
  },
  'units.get': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.get']['check']>) =>
      getUnit(ctx.db, input.id),
  },
  'units.list': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.list']['check']>) =>
      listUnits(ctx.db, input.layerId),
  },
  'units.undoText': {
    run: (ctx: ContractCtx) => undoSessionEdit(ctx.sessionId, ctx.db, 'text'),
  },
  'units.undo': {
    run: (ctx: ContractCtx) => undoSessionEdit(ctx.sessionId, ctx.db),
  },
  'units.split': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.split']['check']>) => {
      const split = splitUnit(ctx.db, input);
      rememberSessionEdit(ctx.sessionId, { kind: 'split', undo: split.undo });
      return { left: split.left, right: split.right };
    },
  },
  'units.merge': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.merge']['check']>) => {
      const merged = mergeUnits(ctx.db, input);
      rememberSessionEdit(ctx.sessionId, { kind: 'merge', undo: merged.undo });
      return merged.unit;
    },
  },
  'units.updateBoundary': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['units.updateBoundary']['check']>,
    ) => updateBoundary(ctx.db, input),
  },
  'deletion.listDue': {
    run: (ctx: ContractCtx) => listDueDeletionReminders(ctx.db),
  },
  'attachments.publish': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['attachments.publish']['check']>) =>
      publishAttachment(ctx.db, ctx.folder, input),
  },
  'attachments.removeLink': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['attachments.removeLink']['check']>,
    ) => removeAttachmentLink(ctx.db, input.linkId),
  },
  'attachments.list': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['attachments.list']['check']>) =>
      listAttachmentLinks(ctx.db, input.lexemeId),
  },
  'attachments.read': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['attachments.read']['check']>) =>
      readAttachmentLink(ctx.db, ctx.folder, input.linkId),
  },
  'attachments.finishCleanup': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['attachments.finishCleanup']['check']>,
    ) => {
      if (ctx.trash === undefined) throw new Error('attachment trash is missing');
      return finishAttachmentCleanup(ctx.db, ctx.folder, input.fileId, ctx.trash);
    },
  },
  'customFields.createDefinition': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.createDefinition']['check']>,
    ) => createDefinition(ctx.db, input),
  },
  'customFields.updateDefinition': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.updateDefinition']['check']>,
    ) => updateDefinition(ctx.db, input),
  },
  'customFields.addOption': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.addOption']['check']>,
    ) => addOption(ctx.db, input),
  },
  'customFields.updateOptionLabel': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.updateOptionLabel']['check']>,
    ) => updateOptionLabel(ctx.db, input),
  },
  'customFields.importDefinition': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.importDefinition']['check']>,
    ) => importDefinition(ctx.db, input),
  },
  'customFields.previewUnitValue': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.previewUnitValue']['check']>,
    ) => previewUnitValue(ctx.db, input),
  },
  'customFields.setUnitValue': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.setUnitValue']['check']>,
    ) => setUnitValue(ctx.db, input),
  },
  'customFields.removeUnitValue': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.removeUnitValue']['check']>,
    ) => removeUnitValue(ctx.db, input),
  },
  'customFields.missingUnitFields': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.missingUnitFields']['check']>,
    ) => missingUnitFields(ctx.db, input.unitId),
  },
  'customFields.previewValue': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.previewValue']['check']>,
    ) => previewFieldValue(ctx.db, input),
  },
  'customFields.setValue': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.setValue']['check']>,
    ) => setFieldValue(ctx.db, input),
  },
  'customFields.removeValue': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.removeValue']['check']>,
    ) => removeFieldValue(ctx.db, input),
  },
  'customFields.missingFields': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.missingFields']['check']>,
    ) => missingFields(ctx.db, input.targetType, input.targetId, input.lexemeId),
  },
  'customFields.listDefinitions': {
    run: (ctx: ContractCtx) => listDefinitions(ctx.db),
  },
  'customFields.locateValues': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.locateValues']['check']>,
    ) => locateCustomFieldValues(ctx.db, input.definitionId),
  },
  'customFields.previewMigration': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.previewMigration']['check']>,
    ) => previewMigration(ctx.db, input.definitionId),
  },
  'customFields.migrateDefinition': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.migrateDefinition']['check']>,
    ) => migrateDefinition(ctx.db, input),
  },
  'customFields.previewPurge': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.previewPurge']['check']>,
    ) => previewPurge(ctx.db, input.definitionId, ctx.sessionId),
  },
  'customFields.purgeDefinition': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['customFields.purgeDefinition']['check']>,
    ) => purgeDefinition(ctx.db, input, undefined, ctx.sessionId),
  },
  'sources.create': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['sources.create']['check']>) =>
      createSource(ctx.db, input),
  },
  'sources.patch': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['sources.patch']['check']>) =>
      patchSource(ctx.db, input),
  },
  'sources.redeliver': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['sources.redeliver']['check']>) =>
      redeliverSource(ctx.db, input.operationId),
  },
  'speakers.patch': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['speakers.patch']['check']>) =>
      patchSpeaker(ctx.db, input),
  },
  'speakers.redeliver': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['speakers.redeliver']['check']>) =>
      redeliverSpeaker(ctx.db, input.operationId),
  },
  'speakers.create': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['speakers.create']['check']>) =>
      createSpeaker(ctx.db, input),
  },
  'speakers.list': {
    run: (ctx: ContractCtx) => listSpeakers(ctx.db),
  },
  'speakers.assign': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['speakers.assign']['check']>) => {
      const assigned = assignSpeaker(ctx.db, input);
      if (assigned.undo !== null) {
        rememberSessionEdit(ctx.sessionId, { kind: 'assign', undo: assigned.undo });
      }
      return assigned.units;
    },
  },
  'conversations.create': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['conversations.create']['check']>,
    ) => createConversation(ctx.db, input),
  },
  'conversations.list': {
    run: (ctx: ContractCtx) => listConversations(ctx.db),
  },
  'conversations.patch': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['conversations.patch']['check']>) =>
      patchConversation(ctx.db, input),
  },
  'conversations.redeliver': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['conversations.redeliver']['check']>,
    ) => redeliverConversation(ctx.db, input.operationId),
  },
  'messages.append': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['messages.append']['check']>) =>
      appendMessage(ctx.db, input),
  },
  'messages.update': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['messages.update']['check']>) =>
      updateMessageBody(ctx.db, input),
  },
  'messages.clear': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['messages.clear']['check']>) =>
      clearConversationMessages(ctx.db, input.conversationId),
  },
  'messages.list': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['messages.list']['check']>) =>
      listMessages(ctx.db, input.conversationId),
  },
  'bibliography.patch': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['bibliography.patch']['check']>) =>
      patchBibliography(ctx.db, input),
  },
  'bibliography.redeliver': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['bibliography.redeliver']['check']>,
    ) => redeliverBibliography(ctx.db, input.operationId),
  },
  'references.listLinks': {
    run: (ctx: ContractCtx) => readLexemeLinks(ctx.db),
  },
  'analysis.apply': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['analysis.apply']['check']>) =>
      applyAnalysis(ctx.db, input),
  },
  'analysis.readState': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['analysis.readState']['check']>) =>
      readAnalysisState(ctx.db, input.unitId),
  },
  'analysis.listCandidates': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['analysis.listCandidates']['check']>,
    ) => listAnalysisCandidates(ctx.db, input.unitId),
  },
  'analysis.listWords': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['analysis.listWords']['check']>) =>
      listUnitWords(ctx.db, input.unitId),
  },
  'analysis.segmentWords': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['analysis.segmentWords']['check']>,
    ) => segmentUnitWords(ctx.db, input.unitId),
  },
  'analysis.listMorphemes': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['analysis.listMorphemes']['check']>,
    ) => listUnitMorphemes(ctx.db, input.unitId),
  },
  'analysis.segmentMorphemes': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['analysis.segmentMorphemes']['check']>,
    ) => segmentUnitMorphemes(ctx.db, input.unitId),
  },
  'analysis.import': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['analysis.import']['check']>) =>
      importAnalysis(ctx.db, input),
  },
  'analysis.submit': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['analysis.submit']['check']>) =>
      submitAnalysis(ctx.db, input),
  },
  'analysis.accept': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['analysis.accept']['check']>) =>
      acceptAnalysis(ctx.db, input),
  },
  'analysis.restore': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['analysis.restore']['check']>) =>
      restoreAnalysis(ctx.db, input),
  },
  'analysis.split': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['analysis.split']['check']>) =>
      splitAnalysisNode(ctx.db, input),
  },
  'analysis.merge': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['analysis.merge']['check']>) =>
      mergeAnalysisNodes(ctx.db, input),
  },
  'exchange.importFile': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['exchange.importFile']['check']>) =>
      importForeignFile({
        folder: ctx.folder,
        file: input.file,
        db: ctx.db,
        ...(input.roles === undefined ? {} : { roles: input.roles }),
      }),
  },
  'exchange.exportJyt': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['exchange.exportJyt']['check']>,
    ) => {
      assertExportTarget(ctx.folder, input, mediaRelpaths(ctx.db));
      return saveDesktopPackage(input, exportDesktopJyt(ctx.db));
    },
  },
  'exchange.exportJym': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['exchange.exportJym']['check']>,
    ) => {
      assertExportTarget(ctx.folder, input, mediaRelpaths(ctx.db));
      return saveDesktopPackage(input, exportDesktopJym(ctx.db, ctx.folder));
    },
  },
  'exchange.exportManuscript': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['exchange.exportManuscript']['check']>,
    ) => {
      assertExportTarget(ctx.folder, input.file, mediaRelpaths(ctx.db));
      return saveDesktopPackage(
        input.file,
        exportDesktopManuscriptJyt(ctx.db, [input.manuscriptId]),
      );
    },
  },
  'units.updateText': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.updateText']['check']>) => {
      const box: { undo: UnitTextUndo | null } = { undo: null };
      const unit = updateUnitText(ctx.db, input, undefined, (undo) => {
        box.undo = undo;
      });
      return { value: unit, undo: box.undo };
    },
    remember: (sessionId, undo) => {
      rememberSessionEdit(sessionId, { kind: 'text', undo });
    },
  },
  'media.finishCleanup': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['media.finishCleanup']['check']>,
    ) => {
      if (ctx.trash === undefined) throw new Error('media trash is missing');
      return finishMediaCleanup(ctx.db, ctx.folder, input.id, input.operationId, ctx.trash);
    },
  },
  'media.create': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['media.create']['check']>) =>
      createMedia(ctx.db, ctx.folder, input),
  },
  'media.delete': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['media.delete']['check']>) =>
      deleteRecording(ctx.db, input.id),
  },
  'media.previewDelete': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['media.previewDelete']['check']>) =>
      previewRecordingDelete(ctx.db, input.id),
  },
  'media.showReminder': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['media.showReminder']['check']>) =>
      showDeletionReminder(ctx.db, 'media', input.id),
  },
  'media.reregister': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['media.reregister']['check']>) =>
      reregisterMedia(ctx.db, ctx.folder, input),
  },
  'media.restoreRegistered': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['media.restoreRegistered']['check']>,
    ) => restoreRegisteredMedia(ctx.db, input.id),
  },
  'media.list': {
    run: (ctx: ContractCtx) => listActiveMedia(ctx.db),
  },
  'media.listDeleted': {
    run: (ctx: ContractCtx) => listDeletedMedia(ctx.db),
  },
  'manuscripts.create': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['manuscripts.create']['check']>) =>
      createManuscript(ctx.db, input),
  },
  'manuscripts.list': {
    run: (ctx: ContractCtx) => listManuscripts(ctx.db),
  },
  'manuscripts.listDeleted': {
    run: (ctx: ContractCtx) => listDeletedManuscripts(ctx.db),
  },
  'manuscripts.delete': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['manuscripts.delete']['check']>) =>
      deleteManuscript(ctx.db, input.id),
  },
  'manuscripts.previewDelete': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['manuscripts.previewDelete']['check']>,
    ) => previewManuscriptDelete(ctx.db, input.id),
  },
  'manuscripts.restore': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['manuscripts.restore']['check']>) =>
      restoreManuscript(ctx.db, input.id),
  },
  'manuscripts.showReminder': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['manuscripts.showReminder']['check']>,
    ) => showDeletionReminder(ctx.db, 'manuscript', input.id),
  },
  'manuscripts.purge': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['manuscripts.purge']['check']>) =>
      purgeManuscript(ctx.db, input.id),
  },
  'manuscripts.setTimeMapping': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['manuscripts.setTimeMapping']['check']>,
    ) => setManuscriptTimeMapping(ctx.db, input),
  },
  'manuscripts.rollbackTimeMapping': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['manuscripts.rollbackTimeMapping']['check']>,
    ) => rollbackManuscriptTimeMapping(ctx.db, input),
  },
} satisfies ContractHandlers;

function runContract(
  method: keyof DesktopOperations,
  sessionId: string,
  args: unknown,
  trash?: MediaTrash,
): unknown {
  const project = requireDesktopSession(sessionId);
  if (desktopOperations[method].undo === 'clear') clearSessionEdit(sessionId);
  const ctx: ContractCtx = {
    db: project.db,
    folder: desktopSessionFolder(sessionId),
    sessionId,
    ...(trash === undefined ? {} : { trash }),
  };
  const raw = objectArg(args);
  if (method === 'units.updateText') {
    const done = operationHandlers['units.updateText'].run(
      ctx,
      desktopOperations['units.updateText'].check(raw),
    );
    if (done.undo !== null) operationHandlers['units.updateText'].remember(sessionId, done.undo);
    return done.value;
  }
  // ponytail: one cast. Each handler is still checked by `satisfies ContractHandlers`. Put a case back if a call is not check-then-run.
  const check = desktopOperations[method].check as (input: Record<string, unknown>) => unknown;
  const run = operationHandlers[method].run as (ctx: ContractCtx, input: unknown) => unknown;
  return run(ctx, check(raw));
}

export function callDesktopSession(
  sessionId: string,
  method: string,
  args: unknown,
  trash?: MediaTrash,
): unknown {
  if (isDesktopOperation(method)) return runContract(method, sessionId, args, trash);
  if (method === 'reopen') {
    reopenDesktopSession(sessionId);
    return { reopened: true };
  }
  throw new Error('unknown desktop call');
}

function mediaRelpaths(db: { prepare(sql: string): { all(): unknown[] } }): string[] {
  return (db.prepare('SELECT relpath FROM media').all() as { relpath: string }[]).map(
    (row) => row.relpath,
  );
}

function objectArg(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error('desktop call args must be an object');
  }
  return args as Record<string, unknown>;
}
