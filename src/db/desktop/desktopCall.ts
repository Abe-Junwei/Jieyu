import { listAttachmentLinks, publishAttachment, removeAttachmentLink } from './attachments';
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
import { patchSource, redeliverSource } from './sourceFields';
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
import { createMedia, listActiveMedia } from './media';
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

const METHODS = [
  'exchange.importFile',
  'exchange.exportJyt',
  'exchange.exportJym',
  'exchange.exportManuscript',
  'reopen',
] as const;

type DesktopMethod = (typeof METHODS)[number];

const KEEPS_UNIT_TEXT_UNDO = new Set<DesktopMethod>([
  'exchange.exportJyt',
  'exchange.exportJym',
  'exchange.exportManuscript',
]);

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
  switch (method) {
    case 'project.get':
      desktopOperations['project.get'].check(raw);
      return operationHandlers['project.get'].run(ctx);
    case 'layers.create':
      return operationHandlers['layers.create'].run(
        ctx,
        desktopOperations['layers.create'].check(raw),
      );
    case 'layers.list':
      return operationHandlers['layers.list'].run(ctx, desktopOperations['layers.list'].check(raw));
    case 'catalog.ensureProjectDefinition':
      return operationHandlers['catalog.ensureProjectDefinition'].run(
        ctx,
        desktopOperations['catalog.ensureProjectDefinition'].check(raw),
      );
    case 'catalog.getLanguage':
      return operationHandlers['catalog.getLanguage'].run(
        ctx,
        desktopOperations['catalog.getLanguage'].check(raw),
      );
    case 'catalog.listLanguages':
      desktopOperations['catalog.listLanguages'].check(raw);
      return operationHandlers['catalog.listLanguages'].run(ctx);
    case 'catalog.updateLanguage':
      return operationHandlers['catalog.updateLanguage'].run(
        ctx,
        desktopOperations['catalog.updateLanguage'].check(raw),
      );
    case 'orthographies.create':
      return operationHandlers['orthographies.create'].run(
        ctx,
        desktopOperations['orthographies.create'].check(raw),
      );
    case 'orthographies.list':
      return operationHandlers['orthographies.list'].run(
        ctx,
        desktopOperations['orthographies.list'].check(raw),
      );
    case 'orthographies.update':
      return operationHandlers['orthographies.update'].run(
        ctx,
        desktopOperations['orthographies.update'].check(raw),
      );
    case 'bridges.create':
      return operationHandlers['bridges.create'].run(
        ctx,
        desktopOperations['bridges.create'].check(raw),
      );
    case 'bridges.get':
      return operationHandlers['bridges.get'].run(ctx, desktopOperations['bridges.get'].check(raw));
    case 'bridges.list':
      desktopOperations['bridges.list'].check(raw);
      return operationHandlers['bridges.list'].run(ctx);
    case 'bridges.update':
      return operationHandlers['bridges.update'].run(
        ctx,
        desktopOperations['bridges.update'].check(raw),
      );
    case 'lexicon.saveEntry':
      return operationHandlers['lexicon.saveEntry'].run(
        ctx,
        desktopOperations['lexicon.saveEntry'].check(raw),
      );
    case 'lexicon.getEntry':
      return operationHandlers['lexicon.getEntry'].run(
        ctx,
        desktopOperations['lexicon.getEntry'].check(raw),
      );
    case 'lexicon.linkSense':
      return operationHandlers['lexicon.linkSense'].run(
        ctx,
        desktopOperations['lexicon.linkSense'].check(raw),
      );
    case 'lexicon.removeSense':
      return operationHandlers['lexicon.removeSense'].run(
        ctx,
        desktopOperations['lexicon.removeSense'].check(raw),
      );
    case 'lexicon.listLinkCandidates':
      desktopOperations['lexicon.listLinkCandidates'].check(raw);
      return operationHandlers['lexicon.listLinkCandidates'].run(ctx);
    case 'lexicon.matchLink':
      return operationHandlers['lexicon.matchLink'].run(
        ctx,
        desktopOperations['lexicon.matchLink'].check(raw),
      );
    case 'lexicon.listTokenLinks':
      return operationHandlers['lexicon.listTokenLinks'].run(
        ctx,
        desktopOperations['lexicon.listTokenLinks'].check(raw),
      );
    case 'lexicon.replaceTokenLink':
      return operationHandlers['lexicon.replaceTokenLink'].run(
        ctx,
        desktopOperations['lexicon.replaceTokenLink'].check(raw),
      );
    case 'lexicon.clearTokenLink':
      return operationHandlers['lexicon.clearTokenLink'].run(
        ctx,
        desktopOperations['lexicon.clearTokenLink'].check(raw),
      );
    case 'lexicon.createLinkedEntry':
      return operationHandlers['lexicon.createLinkedEntry'].run(
        ctx,
        desktopOperations['lexicon.createLinkedEntry'].check(raw),
      );
    case 'notes.create':
      return operationHandlers['notes.create'].run(
        ctx,
        desktopOperations['notes.create'].check(raw),
      );
    case 'notes.update':
      return operationHandlers['notes.update'].run(
        ctx,
        desktopOperations['notes.update'].check(raw),
      );
    case 'notes.delete':
      return operationHandlers['notes.delete'].run(
        ctx,
        desktopOperations['notes.delete'].check(raw),
      );
    case 'notes.list':
      return operationHandlers['notes.list'].run(ctx, desktopOperations['notes.list'].check(raw));
    case 'notes.saveLexeme':
      return operationHandlers['notes.saveLexeme'].run(
        ctx,
        desktopOperations['notes.saveLexeme'].check(raw),
      );
    case 'notes.listLexeme':
      return operationHandlers['notes.listLexeme'].run(
        ctx,
        desktopOperations['notes.listLexeme'].check(raw),
      );
    case 'modelRuns.listAcceptable':
      return operationHandlers['modelRuns.listAcceptable'].run(
        ctx,
        desktopOperations['modelRuns.listAcceptable'].check(raw),
      );
    case 'modelRuns.start':
      return operationHandlers['modelRuns.start'].run(
        ctx,
        desktopOperations['modelRuns.start'].check(raw),
      );
    case 'modelRuns.finish':
      return operationHandlers['modelRuns.finish'].run(
        ctx,
        desktopOperations['modelRuns.finish'].check(raw),
      );
    case 'modelRuns.preview':
      return operationHandlers['modelRuns.preview'].run(
        ctx,
        desktopOperations['modelRuns.preview'].check(raw),
      );
    case 'modelRuns.accept':
      return operationHandlers['modelRuns.accept'].run(
        ctx,
        desktopOperations['modelRuns.accept'].check(raw),
      );
    case 'modelRuns.abandon':
      return operationHandlers['modelRuns.abandon'].run(
        ctx,
        desktopOperations['modelRuns.abandon'].check(raw),
      );
    case 'modelRuns.interrupt':
      desktopOperations['modelRuns.interrupt'].check(raw);
      return operationHandlers['modelRuns.interrupt'].run(ctx);
    case 'modelRuns.stopManuscript':
      return operationHandlers['modelRuns.stopManuscript'].run(
        ctx,
        desktopOperations['modelRuns.stopManuscript'].check(raw),
      );
    case 'modelRuns.stopRecording':
      return operationHandlers['modelRuns.stopRecording'].run(
        ctx,
        desktopOperations['modelRuns.stopRecording'].check(raw),
      );
    case 'modelRuns.get':
      return operationHandlers['modelRuns.get'].run(
        ctx,
        desktopOperations['modelRuns.get'].check(raw),
      );
    case 'modelRuns.readAcceptance':
      return operationHandlers['modelRuns.readAcceptance'].run(
        ctx,
        desktopOperations['modelRuns.readAcceptance'].check(raw),
      );
    case 'corpus.query':
      return operationHandlers['corpus.query'].run(
        ctx,
        desktopOperations['corpus.query'].check(raw),
      );
    case 'units.create':
      return operationHandlers['units.create'].run(
        ctx,
        desktopOperations['units.create'].check(raw),
      );
    case 'units.get':
      return operationHandlers['units.get'].run(ctx, desktopOperations['units.get'].check(raw));
    case 'units.list':
      return operationHandlers['units.list'].run(ctx, desktopOperations['units.list'].check(raw));
    case 'units.undoText':
      desktopOperations['units.undoText'].check(raw);
      return operationHandlers['units.undoText'].run(ctx);
    case 'units.undo':
      desktopOperations['units.undo'].check(raw);
      return operationHandlers['units.undo'].run(ctx);
    case 'units.split':
      return operationHandlers['units.split'].run(ctx, desktopOperations['units.split'].check(raw));
    case 'units.merge':
      return operationHandlers['units.merge'].run(ctx, desktopOperations['units.merge'].check(raw));
    case 'units.updateBoundary':
      return operationHandlers['units.updateBoundary'].run(
        ctx,
        desktopOperations['units.updateBoundary'].check(raw),
      );
    case 'deletion.listDue':
      desktopOperations['deletion.listDue'].check(raw);
      return operationHandlers['deletion.listDue'].run(ctx);
    case 'attachments.publish':
      return operationHandlers['attachments.publish'].run(
        ctx,
        desktopOperations['attachments.publish'].check(raw),
      );
    case 'attachments.removeLink':
      return operationHandlers['attachments.removeLink'].run(
        ctx,
        desktopOperations['attachments.removeLink'].check(raw),
      );
    case 'attachments.list':
      return operationHandlers['attachments.list'].run(
        ctx,
        desktopOperations['attachments.list'].check(raw),
      );
    case 'customFields.createDefinition':
      return operationHandlers['customFields.createDefinition'].run(
        ctx,
        desktopOperations['customFields.createDefinition'].check(raw),
      );
    case 'customFields.updateDefinition':
      return operationHandlers['customFields.updateDefinition'].run(
        ctx,
        desktopOperations['customFields.updateDefinition'].check(raw),
      );
    case 'customFields.addOption':
      return operationHandlers['customFields.addOption'].run(
        ctx,
        desktopOperations['customFields.addOption'].check(raw),
      );
    case 'customFields.updateOptionLabel':
      return operationHandlers['customFields.updateOptionLabel'].run(
        ctx,
        desktopOperations['customFields.updateOptionLabel'].check(raw),
      );
    case 'customFields.importDefinition':
      return operationHandlers['customFields.importDefinition'].run(
        ctx,
        desktopOperations['customFields.importDefinition'].check(raw),
      );
    case 'customFields.previewUnitValue':
      return operationHandlers['customFields.previewUnitValue'].run(
        ctx,
        desktopOperations['customFields.previewUnitValue'].check(raw),
      );
    case 'customFields.setUnitValue':
      return operationHandlers['customFields.setUnitValue'].run(
        ctx,
        desktopOperations['customFields.setUnitValue'].check(raw),
      );
    case 'customFields.removeUnitValue':
      return operationHandlers['customFields.removeUnitValue'].run(
        ctx,
        desktopOperations['customFields.removeUnitValue'].check(raw),
      );
    case 'customFields.missingUnitFields':
      return operationHandlers['customFields.missingUnitFields'].run(
        ctx,
        desktopOperations['customFields.missingUnitFields'].check(raw),
      );
    case 'customFields.previewValue':
      return operationHandlers['customFields.previewValue'].run(
        ctx,
        desktopOperations['customFields.previewValue'].check(raw),
      );
    case 'customFields.setValue':
      return operationHandlers['customFields.setValue'].run(
        ctx,
        desktopOperations['customFields.setValue'].check(raw),
      );
    case 'customFields.removeValue':
      return operationHandlers['customFields.removeValue'].run(
        ctx,
        desktopOperations['customFields.removeValue'].check(raw),
      );
    case 'customFields.missingFields':
      return operationHandlers['customFields.missingFields'].run(
        ctx,
        desktopOperations['customFields.missingFields'].check(raw),
      );
    case 'customFields.listDefinitions':
      desktopOperations['customFields.listDefinitions'].check(raw);
      return operationHandlers['customFields.listDefinitions'].run(ctx);
    case 'customFields.locateValues':
      return operationHandlers['customFields.locateValues'].run(
        ctx,
        desktopOperations['customFields.locateValues'].check(raw),
      );
    case 'customFields.previewMigration':
      return operationHandlers['customFields.previewMigration'].run(
        ctx,
        desktopOperations['customFields.previewMigration'].check(raw),
      );
    case 'customFields.migrateDefinition':
      return operationHandlers['customFields.migrateDefinition'].run(
        ctx,
        desktopOperations['customFields.migrateDefinition'].check(raw),
      );
    case 'customFields.previewPurge':
      return operationHandlers['customFields.previewPurge'].run(
        ctx,
        desktopOperations['customFields.previewPurge'].check(raw),
      );
    case 'customFields.purgeDefinition':
      return operationHandlers['customFields.purgeDefinition'].run(
        ctx,
        desktopOperations['customFields.purgeDefinition'].check(raw),
      );
    case 'sources.patch':
      return operationHandlers['sources.patch'].run(
        ctx,
        desktopOperations['sources.patch'].check(raw),
      );
    case 'sources.redeliver':
      return operationHandlers['sources.redeliver'].run(
        ctx,
        desktopOperations['sources.redeliver'].check(raw),
      );
    case 'speakers.patch':
      return operationHandlers['speakers.patch'].run(
        ctx,
        desktopOperations['speakers.patch'].check(raw),
      );
    case 'speakers.redeliver':
      return operationHandlers['speakers.redeliver'].run(
        ctx,
        desktopOperations['speakers.redeliver'].check(raw),
      );
    case 'speakers.create':
      return operationHandlers['speakers.create'].run(
        ctx,
        desktopOperations['speakers.create'].check(raw),
      );
    case 'speakers.list':
      desktopOperations['speakers.list'].check(raw);
      return operationHandlers['speakers.list'].run(ctx);
    case 'speakers.assign':
      return operationHandlers['speakers.assign'].run(
        ctx,
        desktopOperations['speakers.assign'].check(raw),
      );
    case 'conversations.create':
      return operationHandlers['conversations.create'].run(
        ctx,
        desktopOperations['conversations.create'].check(raw),
      );
    case 'conversations.list':
      desktopOperations['conversations.list'].check(raw);
      return operationHandlers['conversations.list'].run(ctx);
    case 'conversations.patch':
      return operationHandlers['conversations.patch'].run(
        ctx,
        desktopOperations['conversations.patch'].check(raw),
      );
    case 'conversations.redeliver':
      return operationHandlers['conversations.redeliver'].run(
        ctx,
        desktopOperations['conversations.redeliver'].check(raw),
      );
    case 'messages.append':
      return operationHandlers['messages.append'].run(
        ctx,
        desktopOperations['messages.append'].check(raw),
      );
    case 'messages.update':
      return operationHandlers['messages.update'].run(
        ctx,
        desktopOperations['messages.update'].check(raw),
      );
    case 'messages.clear':
      return operationHandlers['messages.clear'].run(
        ctx,
        desktopOperations['messages.clear'].check(raw),
      );
    case 'messages.list':
      return operationHandlers['messages.list'].run(
        ctx,
        desktopOperations['messages.list'].check(raw),
      );
    case 'bibliography.patch':
      return operationHandlers['bibliography.patch'].run(
        ctx,
        desktopOperations['bibliography.patch'].check(raw),
      );
    case 'bibliography.redeliver':
      return operationHandlers['bibliography.redeliver'].run(
        ctx,
        desktopOperations['bibliography.redeliver'].check(raw),
      );
    case 'references.listLinks':
      desktopOperations['references.listLinks'].check(raw);
      return operationHandlers['references.listLinks'].run(ctx);
    case 'analysis.apply':
      return operationHandlers['analysis.apply'].run(
        ctx,
        desktopOperations['analysis.apply'].check(raw),
      );
    case 'analysis.readState':
      return operationHandlers['analysis.readState'].run(
        ctx,
        desktopOperations['analysis.readState'].check(raw),
      );
    case 'analysis.listCandidates':
      return operationHandlers['analysis.listCandidates'].run(
        ctx,
        desktopOperations['analysis.listCandidates'].check(raw),
      );
    case 'analysis.listWords':
      return operationHandlers['analysis.listWords'].run(
        ctx,
        desktopOperations['analysis.listWords'].check(raw),
      );
    case 'analysis.segmentWords':
      return operationHandlers['analysis.segmentWords'].run(
        ctx,
        desktopOperations['analysis.segmentWords'].check(raw),
      );
    case 'analysis.listMorphemes':
      return operationHandlers['analysis.listMorphemes'].run(
        ctx,
        desktopOperations['analysis.listMorphemes'].check(raw),
      );
    case 'analysis.segmentMorphemes':
      return operationHandlers['analysis.segmentMorphemes'].run(
        ctx,
        desktopOperations['analysis.segmentMorphemes'].check(raw),
      );
    case 'analysis.import':
      return operationHandlers['analysis.import'].run(
        ctx,
        desktopOperations['analysis.import'].check(raw),
      );
    case 'analysis.submit':
      return operationHandlers['analysis.submit'].run(
        ctx,
        desktopOperations['analysis.submit'].check(raw),
      );
    case 'analysis.accept':
      return operationHandlers['analysis.accept'].run(
        ctx,
        desktopOperations['analysis.accept'].check(raw),
      );
    case 'analysis.restore':
      return operationHandlers['analysis.restore'].run(
        ctx,
        desktopOperations['analysis.restore'].check(raw),
      );
    case 'analysis.split':
      return operationHandlers['analysis.split'].run(
        ctx,
        desktopOperations['analysis.split'].check(raw),
      );
    case 'analysis.merge':
      return operationHandlers['analysis.merge'].run(
        ctx,
        desktopOperations['analysis.merge'].check(raw),
      );
    case 'units.updateText': {
      const done = operationHandlers['units.updateText'].run(
        ctx,
        desktopOperations['units.updateText'].check(raw),
      );
      if (done.undo !== null) operationHandlers['units.updateText'].remember(sessionId, done.undo);
      return done.value;
    }
    case 'media.finishCleanup':
      return operationHandlers['media.finishCleanup'].run(
        ctx,
        desktopOperations['media.finishCleanup'].check(raw),
      );
    case 'media.create':
      return operationHandlers['media.create'].run(
        ctx,
        desktopOperations['media.create'].check(raw),
      );
    case 'media.delete':
      return operationHandlers['media.delete'].run(
        ctx,
        desktopOperations['media.delete'].check(raw),
      );
    case 'media.previewDelete':
      return operationHandlers['media.previewDelete'].run(
        ctx,
        desktopOperations['media.previewDelete'].check(raw),
      );
    case 'media.showReminder':
      return operationHandlers['media.showReminder'].run(
        ctx,
        desktopOperations['media.showReminder'].check(raw),
      );
    case 'media.reregister':
      return operationHandlers['media.reregister'].run(
        ctx,
        desktopOperations['media.reregister'].check(raw),
      );
    case 'media.restoreRegistered':
      return operationHandlers['media.restoreRegistered'].run(
        ctx,
        desktopOperations['media.restoreRegistered'].check(raw),
      );
    case 'media.list':
      desktopOperations['media.list'].check(raw);
      return operationHandlers['media.list'].run(ctx);
    case 'manuscripts.create':
      return operationHandlers['manuscripts.create'].run(
        ctx,
        desktopOperations['manuscripts.create'].check(raw),
      );
    case 'manuscripts.list':
      desktopOperations['manuscripts.list'].check(raw);
      return operationHandlers['manuscripts.list'].run(ctx);
    case 'manuscripts.listDeleted':
      desktopOperations['manuscripts.listDeleted'].check(raw);
      return operationHandlers['manuscripts.listDeleted'].run(ctx);
    case 'manuscripts.delete':
      return operationHandlers['manuscripts.delete'].run(
        ctx,
        desktopOperations['manuscripts.delete'].check(raw),
      );
    case 'manuscripts.previewDelete':
      return operationHandlers['manuscripts.previewDelete'].run(
        ctx,
        desktopOperations['manuscripts.previewDelete'].check(raw),
      );
    case 'manuscripts.restore':
      return operationHandlers['manuscripts.restore'].run(
        ctx,
        desktopOperations['manuscripts.restore'].check(raw),
      );
    case 'manuscripts.showReminder':
      return operationHandlers['manuscripts.showReminder'].run(
        ctx,
        desktopOperations['manuscripts.showReminder'].check(raw),
      );
    case 'manuscripts.purge':
      return operationHandlers['manuscripts.purge'].run(
        ctx,
        desktopOperations['manuscripts.purge'].check(raw),
      );
    case 'manuscripts.setTimeMapping':
      return operationHandlers['manuscripts.setTimeMapping'].run(
        ctx,
        desktopOperations['manuscripts.setTimeMapping'].check(raw),
      );
    case 'manuscripts.rollbackTimeMapping':
      return operationHandlers['manuscripts.rollbackTimeMapping'].run(
        ctx,
        desktopOperations['manuscripts.rollbackTimeMapping'].check(raw),
      );
    default: {
      const unreachable: never = method;
      return unreachable;
    }
  }
}

export function callDesktopSession(
  sessionId: string,
  method: string,
  args: unknown,
  trash?: MediaTrash,
): unknown {
  if (isDesktopOperation(method)) return runContract(method, sessionId, args, trash);
  const parsed = parseMethod(method);
  if (parsed === 'reopen') {
    reopenDesktopSession(sessionId);
    return { reopened: true };
  }
  const project = requireDesktopSession(sessionId);
  if (!KEEPS_UNIT_TEXT_UNDO.has(parsed)) clearSessionEdit(sessionId);
  const input = objectArg(args);
  switch (parsed) {
    case 'exchange.importFile':
      return importExchangeFile(project.db, desktopSessionFolder(sessionId), input);
    case 'exchange.exportJyt': {
      const file = exportFile(input);
      assertExportTarget(desktopSessionFolder(sessionId), file, mediaRelpaths(project.db));
      return saveDesktopPackage(file, exportDesktopJyt(project.db));
    }
    case 'exchange.exportJym': {
      const file = exportFile(input);
      const folder = desktopSessionFolder(sessionId);
      assertExportTarget(folder, file, mediaRelpaths(project.db));
      return saveDesktopPackage(file, exportDesktopJym(project.db, folder));
    }
    case 'exchange.exportManuscript': {
      knownKeys(input, ['file', 'manuscriptId']);
      const file = requiredString(input.file, 'file');
      assertExportTarget(desktopSessionFolder(sessionId), file, mediaRelpaths(project.db));
      return saveDesktopPackage(
        file,
        exportDesktopManuscriptJyt(project.db, [
          requiredString(input.manuscriptId, 'manuscriptId'),
        ]),
      );
    }
    default: {
      const unreachable: never = parsed;
      return unreachable;
    }
  }
}

function exportFile(input: Record<string, unknown>): string {
  knownKeys(input, ['file']);
  return requiredString(input.file, 'file');
}

function mediaRelpaths(db: { prepare(sql: string): { all(): unknown[] } }): string[] {
  return (db.prepare('SELECT relpath FROM media').all() as { relpath: string }[]).map(
    (row) => row.relpath,
  );
}

function importExchangeFile(
  db: Parameters<typeof importForeignFile>[0]['db'],
  folder: string,
  input: Record<string, unknown>,
): ReturnType<typeof importForeignFile> {
  knownKeys(input, ['file', 'roles']);
  const roles = input.roles === undefined ? undefined : requiredString(input.roles, 'roles');
  return importForeignFile({
    folder,
    file: requiredString(input.file, 'file'),
    ...(db === undefined ? {} : { db }),
    ...(roles === undefined ? {} : { roles }),
  });
}

function parseMethod(method: string): DesktopMethod {
  if ((METHODS as readonly string[]).includes(method)) return method as DesktopMethod;
  throw new Error('unknown desktop call');
}

function objectArg(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error('desktop call args must be an object');
  }
  return args as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`desktop call ${name} must be a string`);
  }
  return value;
}

function knownKeys(input: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new Error(`desktop call field ${key} is not supported`);
  }
}
