import {
  listAttachmentLinks,
  publishAttachment,
  removeAttachmentLink,
  type AttachmentKind,
  type AttachmentPublish,
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
import { queryCorpus, type CorpusQuery, type CorpusQueryCursor } from './corpusQuery';
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
  type AnalysisCredentials,
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
  CUSTOM_FIELD_DEFINITION_KEYS,
  CUSTOM_FIELD_UPDATE_KEYS,
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
import {
  patchBibliography,
  redeliverBibliography,
  type BibliographyPatch,
} from './bibliographyFields';
import {
  patchConversation,
  redeliverConversation,
  type ConversationPatch,
} from './conversationFields';
import { assignSpeaker } from './speakerAssign';
import { patchSpeaker, redeliverSpeaker, type SpeakerPatch } from './speakerFields';
import { createSpeaker, listSpeakers } from './speakers';
import { patchSource, redeliverSource, type SourcePatch } from './sourceFields';
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
  type MessageAppend,
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
  type UnitCreate,
  type UnitTextUndo,
} from './units';
import { mergeUnits, splitUnit } from './unitSpan';

const METHODS = [
  'deletion.listDue',
  'attachments.publish',
  'attachments.removeLink',
  'attachments.list',
  'corpus.query',
  'units.create',
  'units.get',
  'units.list',
  'units.undoText',
  'units.undo',
  'units.split',
  'units.merge',
  'units.updateBoundary',
  'customFields.createDefinition',
  'customFields.updateDefinition',
  'customFields.addOption',
  'customFields.updateOptionLabel',
  'customFields.importDefinition',
  'customFields.previewUnitValue',
  'customFields.setUnitValue',
  'customFields.removeUnitValue',
  'customFields.missingUnitFields',
  'customFields.previewValue',
  'customFields.setValue',
  'customFields.removeValue',
  'customFields.missingFields',
  'customFields.listDefinitions',
  'references.listLinks',
  'customFields.locateValues',
  'customFields.previewMigration',
  'customFields.migrateDefinition',
  'customFields.previewPurge',
  'customFields.purgeDefinition',
  'sources.patch',
  'sources.redeliver',
  'speakers.patch',
  'speakers.redeliver',
  'speakers.create',
  'speakers.list',
  'speakers.assign',
  'conversations.create',
  'conversations.list',
  'conversations.patch',
  'conversations.redeliver',
  'messages.append',
  'messages.update',
  'messages.clear',
  'messages.list',
  'bibliography.patch',
  'bibliography.redeliver',
  'analysis.apply',
  'analysis.readState',
  'analysis.listCandidates',
  'analysis.listWords',
  'analysis.segmentWords',
  'analysis.listMorphemes',
  'analysis.segmentMorphemes',
  'analysis.import',
  'analysis.submit',
  'analysis.accept',
  'analysis.restore',
  'analysis.split',
  'analysis.merge',
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
  'units.undoText',
  'units.undo',
  'speakers.assign',
  'speakers.list',
  'units.get',
  'units.list',
  'attachments.list',
  'corpus.query',
  'deletion.listDue',
  'customFields.listDefinitions',
  'customFields.missingUnitFields',
  'customFields.missingFields',
  'customFields.locateValues',
  'customFields.previewUnitValue',
  'customFields.previewValue',
  'customFields.previewMigration',
  'customFields.previewPurge',
  'references.listLinks',
  'analysis.readState',
  'analysis.listCandidates',
  'analysis.listWords',
  'analysis.listMorphemes',
  'messages.list',
  'conversations.list',
]);

type ContractCtx = {
  db: ReturnType<typeof requireDesktopSession>['db'];
  folder: string;
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
    case 'deletion.listDue':
      knownKeys(input, []);
      return listDueDeletionReminders(project.db);
    case 'attachments.publish':
      return publishAttachment(
        project.db,
        desktopSessionFolder(sessionId),
        attachmentPublish(input),
      );
    case 'attachments.removeLink':
      knownKeys(input, ['linkId']);
      return removeAttachmentLink(project.db, requiredString(input.linkId, 'linkId'));
    case 'attachments.list':
      knownKeys(input, ['lexemeId']);
      return listAttachmentLinks(project.db, requiredString(input.lexemeId, 'lexemeId'));
    case 'corpus.query':
      return queryCorpus(project.db, corpusQuery(input));
    case 'units.create':
      return createUnit(project.db, unitCreate(input));
    case 'units.get':
      return getUnit(project.db, requiredString(input.id, 'id'));
    case 'units.list':
      return listUnits(project.db, requiredString(input.layerId, 'layerId'));
    case 'units.undoText':
      return undoSessionEdit(sessionId, project.db, 'text');
    case 'units.undo':
      return undoSessionEdit(sessionId, project.db);
    case 'units.split': {
      const split = splitUnit(project.db, {
        unitId: requiredString(input.unitId, 'unitId'),
        time: requiredNumber(input.time, 'time'),
      });
      rememberSessionEdit(sessionId, { kind: 'split', undo: split.undo });
      return { left: split.left, right: split.right };
    }
    case 'units.merge': {
      const merged = mergeUnits(project.db, {
        keepId: requiredString(input.keepId, 'keepId'),
        removeId: requiredString(input.removeId, 'removeId'),
      });
      rememberSessionEdit(sessionId, { kind: 'merge', undo: merged.undo });
      return merged.unit;
    }
    case 'units.updateBoundary':
      return updateBoundary(project.db, {
        leftId: requiredString(input.leftId, 'leftId'),
        rightId: requiredString(input.rightId, 'rightId'),
        time: requiredNumber(input.time, 'time'),
      });
    case 'customFields.createDefinition':
      knownKeys(input, CUSTOM_FIELD_DEFINITION_KEYS);
      return createDefinition(project.db, input);
    case 'customFields.updateDefinition':
      knownKeys(input, CUSTOM_FIELD_UPDATE_KEYS);
      return updateDefinition(project.db, input);
    case 'customFields.addOption':
      knownKeys(input, ['definitionId', 'expectedRevision', 'label', 'sortOrder']);
      return addOption(project.db, input);
    case 'customFields.updateOptionLabel':
      knownKeys(input, ['definitionId', 'optionId', 'expectedRevision', 'label']);
      return updateOptionLabel(project.db, input);
    case 'customFields.importDefinition':
      knownKeys(input, ['mode', 'definition']);
      return importDefinition(project.db, input);
    case 'customFields.previewUnitValue':
      knownKeys(input, ['definitionId', 'unitId', 'value']);
      return previewUnitValue(project.db, input);
    case 'customFields.setUnitValue':
      knownKeys(input, ['definitionId', 'unitId', 'value', 'expectedRevision']);
      return setUnitValue(project.db, input);
    case 'customFields.removeUnitValue':
      knownKeys(input, ['definitionId', 'unitId']);
      return removeUnitValue(project.db, input);
    case 'customFields.missingUnitFields':
      knownKeys(input, ['unitId']);
      return missingUnitFields(project.db, requiredString(input.unitId, 'unitId'));
    case 'customFields.previewValue':
      knownKeys(input, ['definitionId', 'targetType', 'targetId', 'value', 'lexemeId']);
      return previewFieldValue(project.db, input);
    case 'customFields.setValue':
      knownKeys(input, [
        'definitionId',
        'targetType',
        'targetId',
        'value',
        'expectedRevision',
        'lexemeId',
      ]);
      return setFieldValue(project.db, input);
    case 'customFields.removeValue':
      knownKeys(input, ['definitionId', 'targetType', 'targetId', 'lexemeId']);
      return removeFieldValue(project.db, input);
    case 'customFields.missingFields':
      knownKeys(input, ['targetType', 'targetId', 'lexemeId']);
      return missingFields(
        project.db,
        requiredString(input.targetType, 'targetType'),
        requiredString(input.targetId, 'targetId'),
        input.lexemeId === undefined ? undefined : requiredString(input.lexemeId, 'lexemeId'),
      );
    case 'customFields.listDefinitions':
      knownKeys(input, []);
      return listDefinitions(project.db);
    case 'references.listLinks':
      knownKeys(input, []);
      return readLexemeLinks(project.db);
    case 'customFields.locateValues':
      knownKeys(input, ['definitionId']);
      return locateCustomFieldValues(
        project.db,
        requiredString(input.definitionId, 'definitionId'),
      );
    case 'customFields.previewMigration':
      knownKeys(input, ['definitionId']);
      return previewMigration(project.db, requiredString(input.definitionId, 'definitionId'));
    case 'customFields.migrateDefinition':
      knownKeys(input, ['definitionId', 'expectedRevision', 'definition', 'conversions']);
      return migrateDefinition(project.db, input);
    case 'customFields.previewPurge':
      knownKeys(input, ['definitionId']);
      return previewPurge(
        project.db,
        requiredString(input.definitionId, 'definitionId'),
        sessionId,
      );
    case 'customFields.purgeDefinition':
      knownKeys(input, ['definitionId', 'expectedRevision', 'previewFingerprint']);
      return purgeDefinition(project.db, input, undefined, sessionId);
    case 'sources.patch':
      return patchSource(project.db, sourcePatch(input));
    case 'sources.redeliver':
      knownKeys(input, ['operationId']);
      return redeliverSource(project.db, requiredString(input.operationId, 'operationId'));
    case 'speakers.patch':
      return patchSpeaker(project.db, speakerPatch(input));
    case 'speakers.redeliver':
      knownKeys(input, ['operationId']);
      return redeliverSpeaker(project.db, requiredString(input.operationId, 'operationId'));
    case 'speakers.create':
      knownKeys(input, ['name']);
      return createSpeaker(project.db, { name: requiredString(input.name, 'name') });
    case 'speakers.list':
      knownKeys(input, []);
      return listSpeakers(project.db);
    case 'speakers.assign': {
      knownKeys(input, ['speakerId', 'unitIds']);
      const assigned = assignSpeaker(project.db, {
        speakerId: requiredString(input.speakerId, 'speakerId'),
        unitIds: stringIds(input.unitIds, 'unitIds'),
      });
      if (assigned.undo !== null) {
        rememberSessionEdit(sessionId, { kind: 'assign', undo: assigned.undo });
      }
      return assigned.units;
    }
    case 'conversations.create':
      knownKeys(input, ['title', 'fieldValues']);
      return createConversation(project.db, {
        title: requiredString(input.title, 'title'),
        ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
      });
    case 'conversations.list':
      knownKeys(input, []);
      return listConversations(project.db);
    case 'conversations.patch':
      return patchConversation(project.db, conversationPatch(input));
    case 'conversations.redeliver':
      knownKeys(input, ['operationId']);
      return redeliverConversation(project.db, requiredString(input.operationId, 'operationId'));
    case 'messages.append':
      return appendMessage(project.db, messageAppend(input));
    case 'messages.update':
      knownKeys(input, ['id', 'body']);
      return updateMessageBody(project.db, {
        id: requiredString(input.id, 'id'),
        body: requiredString(input.body, 'body'),
      });
    case 'messages.clear':
      knownKeys(input, ['conversationId']);
      return clearConversationMessages(
        project.db,
        requiredString(input.conversationId, 'conversationId'),
      );
    case 'messages.list':
      knownKeys(input, ['conversationId']);
      return listMessages(project.db, requiredString(input.conversationId, 'conversationId'));
    case 'bibliography.patch':
      return patchBibliography(project.db, bibliographyPatch(input));
    case 'bibliography.redeliver':
      knownKeys(input, ['operationId']);
      return redeliverBibliography(project.db, requiredString(input.operationId, 'operationId'));
    case 'analysis.apply':
      return applyAnalysis(project.db, analysisApply(input));
    case 'analysis.readState': {
      knownKeys(input, ['unitId']);
      return readAnalysisState(project.db, requiredString(input.unitId, 'unitId'));
    }
    case 'analysis.listCandidates':
      knownKeys(input, ['unitId']);
      return listAnalysisCandidates(project.db, requiredString(input.unitId, 'unitId'));
    case 'analysis.listWords':
      knownKeys(input, ['unitId']);
      return listUnitWords(project.db, requiredString(input.unitId, 'unitId'));
    case 'analysis.segmentWords':
      knownKeys(input, ['unitId']);
      return segmentUnitWords(project.db, requiredString(input.unitId, 'unitId'));
    case 'analysis.listMorphemes':
      knownKeys(input, ['unitId']);
      return listUnitMorphemes(project.db, requiredString(input.unitId, 'unitId'));
    case 'analysis.segmentMorphemes':
      knownKeys(input, ['unitId']);
      return segmentUnitMorphemes(project.db, requiredString(input.unitId, 'unitId'));
    case 'analysis.import':
      return importAnalysis(project.db, analysisImport(input));
    case 'analysis.submit':
      return submitAnalysis(project.db, analysisSubmit(input));
    case 'analysis.accept':
      return acceptAnalysis(project.db, analysisCandidate(input));
    case 'analysis.restore':
      return restoreAnalysis(project.db, analysisRestore(input));
    case 'analysis.split':
      return splitAnalysisNode(project.db, analysisSplit(input));
    case 'analysis.merge':
      return mergeAnalysisNodes(project.db, analysisMerge(input));
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

function attachmentPublish(input: Record<string, unknown>): AttachmentPublish {
  knownKeys(input, ['lexemeId', 'displayName', 'kind', 'mimeType', 'bytes', 'operationId']);
  return {
    lexemeId: requiredString(input.lexemeId, 'lexemeId'),
    displayName: requiredString(input.displayName, 'displayName'),
    kind: attachmentKind(input.kind),
    mimeType: requiredString(input.mimeType, 'mimeType'),
    bytes: attachmentBytes(input.bytes),
    operationId: requiredString(input.operationId, 'operationId'),
  };
}

function attachmentKind(value: unknown): AttachmentKind {
  if (value === 'image' || value === 'audio' || value === 'document') return value;
  throw new Error('attachment kind is invalid');
}

function attachmentBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  throw new Error('attachment bytes are invalid');
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

function sourcePatch(input: Record<string, unknown>): SourcePatch {
  knownKeys(input, ['operationId', 'id', 'label', 'externalId']);
  const label = sourceField(input.label, 'label');
  const externalId = sourceField(input.externalId, 'externalId');
  if (label === undefined && externalId === undefined) throw new Error('source patch is empty');
  return {
    operationId: requiredString(input.operationId, 'operationId'),
    id: requiredString(input.id, 'id'),
    ...(label === undefined ? {} : { label }),
    ...(externalId === undefined ? {} : { externalId }),
  };
}

function bibliographyPatch(input: Record<string, unknown>): BibliographyPatch {
  knownKeys(input, [
    'operationId',
    'id',
    'title',
    'authors',
    'year',
    'publisher',
    'doi',
    'url',
    'citationKey',
    'sourceType',
    'notes',
    'accessRights',
  ]);
  const title = speakerText(input.title, 'title', false);
  const publisher = speakerText(input.publisher, 'publisher', true);
  const doi = speakerText(input.doi, 'doi', true);
  const url = speakerText(input.url, 'url', true);
  const citationKey = speakerText(input.citationKey, 'citationKey', true);
  const year = bibliographyYear(input.year);
  const authors = bibliographyAuthors(input.authors);
  const sourceType = speakerEnum(input.sourceType, 'sourceType', [
    'book',
    'article',
    'thesis',
    'fieldnotes',
    'grammar',
    'other',
  ]);
  const accessRights = speakerEnum(input.accessRights, 'accessRights', [
    'open',
    'restricted',
    'confidential',
  ]);
  const notes = speakerNotes(input.notes);
  const patch: BibliographyPatch = {
    operationId: requiredString(input.operationId, 'operationId'),
    id: requiredString(input.id, 'id'),
  };
  if (title !== undefined) {
    if (typeof title.value !== 'string')
      throw new Error('desktop call title.value must be a string');
    patch.title = { expectedRevision: title.expectedRevision, value: title.value };
  }
  if (authors !== undefined) patch.authors = authors;
  if (year !== undefined) patch.year = year;
  if (publisher !== undefined) patch.publisher = publisher;
  if (doi !== undefined) patch.doi = doi;
  if (url !== undefined) patch.url = url;
  if (citationKey !== undefined) patch.citationKey = citationKey;
  if (sourceType !== undefined) patch.sourceType = sourceType;
  if (notes !== undefined) patch.notes = orderedNotes(notes);
  if (accessRights !== undefined) patch.accessRights = accessRights;
  if (Object.keys(patch).length === 2) throw new Error('bibliography patch is empty');
  return patch;
}

function bibliographyYear(
  value: unknown,
): { expectedRevision: number; value: number | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const year = record.value;
  if (year !== null && (typeof year !== 'number' || !Number.isInteger(year))) {
    throw new Error('desktop call year.value must be a year');
  }
  return { expectedRevision: revisionOf(record.expectedRevision, 'year'), value: year };
}

function bibliographyAuthors(
  value: unknown,
): { expectedRevision: number; value: string[] | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const authors = record.value;
  if (authors === null) {
    return { expectedRevision: revisionOf(record.expectedRevision, 'authors'), value: null };
  }
  if (
    !Array.isArray(authors) ||
    authors.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error('desktop call authors.value must be author names');
  }
  return {
    expectedRevision: revisionOf(record.expectedRevision, 'authors'),
    value: authors as string[],
  };
}

function orderedNotes(patch: { expectedRevision: number; value: Record<string, string> | null }): {
  expectedRevision: number;
  value: Record<string, string> | null;
} {
  if (patch.value === null) return patch;
  const keys = Object.keys(patch.value).sort();
  if (keys.length === 0 || keys.some((key) => patch.value?.[key]?.length === 0)) {
    throw new Error('desktop call notes.value must be notes');
  }
  const ordered: Record<string, string> = {};
  for (const key of keys) ordered[key] = patch.value[key] ?? '';
  return { expectedRevision: patch.expectedRevision, value: ordered };
}

function messageAppend(input: Record<string, unknown>): MessageAppend {
  knownKeys(input, ['id', 'conversationId', 'role', 'body', 'fieldValues']);
  return {
    ...(input.id === undefined ? {} : { id: requiredString(input.id, 'id') }),
    conversationId: requiredString(input.conversationId, 'conversationId'),
    role: messageRole(input.role),
    body: requiredString(input.body, 'body'),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function messageRole(value: unknown): MessageAppend['role'] {
  if (value === 'system' || value === 'user' || value === 'assistant' || value === 'tool') {
    return value;
  }
  throw new Error('desktop call role must be a message role');
}

function conversationPatch(input: Record<string, unknown>): ConversationPatch {
  knownKeys(input, [
    'operationId',
    'id',
    'title',
    'mode',
    'providerId',
    'model',
    'archived',
    'clearedAt',
  ]);
  const title = speakerText(input.title, 'title', false);
  const providerId = speakerText(input.providerId, 'providerId', true);
  const model = speakerText(input.model, 'model', true);
  const clearedAt = speakerText(input.clearedAt, 'clearedAt', true);
  const mode = speakerEnum(input.mode, 'mode', ['assistant', 'analysis', 'review']);
  const archived = conversationArchived(input.archived);
  const patch: ConversationPatch = {
    operationId: requiredString(input.operationId, 'operationId'),
    id: requiredString(input.id, 'id'),
  };
  if (title !== undefined) {
    if (typeof title.value !== 'string')
      throw new Error('desktop call title.value must be a string');
    patch.title = { expectedRevision: title.expectedRevision, value: title.value };
  }
  if (mode !== undefined) patch.mode = mode;
  if (providerId !== undefined) patch.providerId = providerId;
  if (model !== undefined) patch.model = model;
  if (archived !== undefined) patch.archived = archived;
  if (clearedAt !== undefined) patch.clearedAt = clearedAt;
  if (Object.keys(patch).length === 2) throw new Error('conversation patch is empty');
  return patch;
}

function conversationArchived(
  value: unknown,
): { expectedRevision: number; value: boolean | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const archived = record.value;
  if (archived !== null && typeof archived !== 'boolean') {
    throw new Error('desktop call archived.value must be a boolean');
  }
  return { expectedRevision: revisionOf(record.expectedRevision, 'archived'), value: archived };
}

function speakerPatch(input: Record<string, unknown>): SpeakerPatch {
  knownKeys(input, [
    'operationId',
    'id',
    'name',
    'pseudonym',
    'gender',
    'birthYear',
    'languageIds',
    'dialect',
    'accent',
    'role',
    'consentStatus',
    'accessRights',
    'address',
    'notes',
  ]);
  const patch: SpeakerPatch = {
    operationId: requiredString(input.operationId, 'operationId'),
    id: requiredString(input.id, 'id'),
  };
  const name = speakerText(input.name, 'name', false);
  const pseudonym = speakerText(input.pseudonym, 'pseudonym', true);
  const gender = speakerText(input.gender, 'gender', true);
  const dialect = speakerText(input.dialect, 'dialect', true);
  const accent = speakerText(input.accent, 'accent', true);
  const address = speakerText(input.address, 'address', true);
  const birthYear = speakerBirthYear(input.birthYear);
  const languageIds = speakerLanguageIds(input.languageIds);
  const role = speakerEnum(input.role, 'role', [
    'speaker',
    'translator',
    'annotator',
    'researcher',
  ]);
  const consentStatus = speakerEnum(input.consentStatus, 'consentStatus', [
    'granted',
    'restricted',
    'anonymous',
  ]);
  const accessRights = speakerEnum(input.accessRights, 'accessRights', [
    'open',
    'restricted',
    'confidential',
  ]);
  const notes = speakerNotes(input.notes);
  if (name !== undefined) {
    if (typeof name.value !== 'string') throw new Error('desktop call name.value must be a string');
    patch.name = { expectedRevision: name.expectedRevision, value: name.value };
  }
  if (pseudonym !== undefined) patch.pseudonym = pseudonym;
  if (gender !== undefined) patch.gender = gender;
  if (birthYear !== undefined) patch.birthYear = birthYear;
  if (languageIds !== undefined) patch.languageIds = languageIds;
  if (dialect !== undefined) patch.dialect = dialect;
  if (accent !== undefined) patch.accent = accent;
  if (role !== undefined) patch.role = role;
  if (consentStatus !== undefined) patch.consentStatus = consentStatus;
  if (accessRights !== undefined) patch.accessRights = accessRights;
  if (address !== undefined) patch.address = address;
  if (notes !== undefined) patch.notes = notes;
  if (Object.keys(patch).length === 2) throw new Error('speaker patch is empty');
  return patch;
}

function speakerText(
  value: unknown,
  name: string,
  nullable: boolean,
): { expectedRevision: number; value: string | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const text = record.value;
  if (text === null && nullable) {
    return { expectedRevision: revisionOf(record.expectedRevision, name), value: null };
  }
  return {
    expectedRevision: revisionOf(record.expectedRevision, name),
    value: requiredString(text, `${name}.value`),
  };
}

function speakerBirthYear(
  value: unknown,
): { expectedRevision: number; value: number | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const year = record.value;
  if (year !== null && (typeof year !== 'number' || !Number.isInteger(year))) {
    throw new Error('desktop call birthYear.value must be a year');
  }
  return { expectedRevision: revisionOf(record.expectedRevision, 'birthYear'), value: year };
}

function speakerLanguageIds(
  value: unknown,
): { expectedRevision: number; value: string[] | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const ids = record.value;
  if (ids === null) {
    return { expectedRevision: revisionOf(record.expectedRevision, 'languageIds'), value: null };
  }
  if (!Array.isArray(ids) || ids.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error('desktop call languageIds.value must be language ids');
  }
  if (new Set(ids).size !== ids.length)
    throw new Error('desktop call languageIds.value must be language ids');
  return {
    expectedRevision: revisionOf(record.expectedRevision, 'languageIds'),
    value: ids as string[],
  };
}

function speakerEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): { expectedRevision: number; value: T | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const item = record.value;
  if (item === null)
    return { expectedRevision: revisionOf(record.expectedRevision, name), value: null };
  if (typeof item !== 'string' || !allowed.includes(item as T)) {
    throw new Error(`desktop call ${name}.value is invalid`);
  }
  return { expectedRevision: revisionOf(record.expectedRevision, name), value: item as T };
}

function speakerNotes(
  value: unknown,
): { expectedRevision: number; value: Record<string, string> | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  if (record.value === null) {
    return { expectedRevision: revisionOf(record.expectedRevision, 'notes'), value: null };
  }
  return {
    expectedRevision: revisionOf(record.expectedRevision, 'notes'),
    value: stringMap(record.value, 'notes.value'),
  };
}

function revisionOf(value: unknown, name: string): number {
  const revision = requiredNumber(value, `${name}.expectedRevision`);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error(`desktop call ${name}.expectedRevision must be a revision`);
  }
  return revision;
}

function sourceField(
  value: unknown,
  name: 'label' | 'externalId',
): { expectedRevision: number; value: string } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const expectedRevision = requiredNumber(record.expectedRevision, `${name}.expectedRevision`);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error(`desktop call ${name}.expectedRevision must be a revision`);
  }
  return { expectedRevision, value: requiredString(record.value, `${name}.value`) };
}

function fingerprintString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('desktop call graphFingerprint must be a string');
  return value;
}

function stringIds(value: unknown, name: string): string[] {
  const list = listArg(value, name);
  if (list.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`desktop call ${name} must be a list`);
  }
  return list as string[];
}

function requiredNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`desktop call ${name} must be a number`);
  }
  return value;
}

function stringMap(value: unknown, name: string): Record<string, string> {
  const record = objectArg(value);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'string') throw new Error(`desktop call ${name} values must be strings`);
    out[key] = item;
  }
  return out;
}

function analysisCredentials(input: Record<string, unknown>): AnalysisCredentials {
  const expected = objectArg(input.expected);
  knownKeys(expected, ['manuscriptGeneration', 'analysisGeneration', 'graphFingerprint']);
  return {
    manuscriptGeneration: requiredNumber(expected.manuscriptGeneration, 'manuscriptGeneration'),
    analysisGeneration: requiredNumber(expected.analysisGeneration, 'analysisGeneration'),
    graphFingerprint: fingerprintString(expected.graphFingerprint),
  };
}

function analysisImport(input: Record<string, unknown>): {
  unitId: string;
  expected: AnalysisCredentials;
  nodes: unknown[];
  relations: unknown[];
  removeNodes: unknown[];
  removeRelations: unknown[];
} {
  knownKeys(input, ['unitId', 'expected', 'nodes', 'relations', 'removeNodes', 'removeRelations']);
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    expected: analysisCredentials(input),
    nodes: listArg(input.nodes, 'nodes'),
    relations: listArg(input.relations, 'relations'),
    removeNodes: listArg(input.removeNodes, 'removeNodes'),
    removeRelations: listArg(input.removeRelations, 'removeRelations'),
  };
}

function listArg(value: unknown, name: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`desktop call ${name} must be a list`);
  return value;
}

function analysisSubmit(input: Record<string, unknown>): {
  unitId: string;
  graph: unknown;
  expected: AnalysisCredentials;
  definitionRevisions: { definitionId: string; revision: number }[];
} {
  knownKeys(input, ['unitId', 'graph', 'expected', 'definitionRevisions']);
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    graph: input.graph,
    expected: analysisCredentials(input),
    definitionRevisions: revisionBasis(input.definitionRevisions),
  };
}

function revisionBasis(value: unknown): { definitionId: string; revision: number }[] {
  if (!Array.isArray(value)) throw new Error('custom field revision does not match');
  return value.map((item) => {
    const record = objectArg(item);
    knownKeys(record, ['definitionId', 'revision']);
    return {
      definitionId: requiredString(record.definitionId, 'definitionId'),
      revision: requiredNumber(record.revision, 'revision'),
    };
  });
}

function analysisCandidate(input: Record<string, unknown>): {
  candidateId: string;
  expected: AnalysisCredentials;
} {
  knownKeys(input, ['candidateId', 'expected']);
  return {
    candidateId: requiredString(input.candidateId, 'candidateId'),
    expected: analysisCredentials(input),
  };
}

function analysisRestore(input: Record<string, unknown>): {
  candidateId: string;
  expected: AnalysisCredentials;
  conversions?: unknown[];
} {
  knownKeys(input, ['candidateId', 'expected', 'conversions']);
  return {
    candidateId: requiredString(input.candidateId, 'candidateId'),
    expected: analysisCredentials(input),
    ...(input.conversions === undefined
      ? {}
      : { conversions: listArg(input.conversions, 'conversions') }),
  };
}

function analysisSplit(input: Record<string, unknown>): {
  unitId: string;
  nodeId: string;
  into: [unknown, unknown];
  expected: AnalysisCredentials;
} {
  knownKeys(input, ['unitId', 'nodeId', 'into', 'expected']);
  if (!Array.isArray(input.into) || input.into.length !== 2) {
    throw new Error('desktop call into must be a pair');
  }
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    nodeId: requiredString(input.nodeId, 'nodeId'),
    into: [input.into[0], input.into[1]],
    expected: analysisCredentials(input),
  };
}

function analysisMerge(input: Record<string, unknown>): {
  unitId: string;
  nodeIds: [string, string];
  into: unknown;
  expected: AnalysisCredentials;
} {
  knownKeys(input, ['unitId', 'nodeIds', 'into', 'expected']);
  if (!Array.isArray(input.nodeIds) || input.nodeIds.length !== 2) {
    throw new Error('desktop call nodeIds must be a pair');
  }
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    nodeIds: [
      requiredString(input.nodeIds[0], 'nodeIds'),
      requiredString(input.nodeIds[1], 'nodeIds'),
    ],
    into: input.into,
    expected: analysisCredentials(input),
  };
}

function analysisApply(input: Record<string, unknown>): {
  unitId: string;
  expected: { manuscriptGeneration: number; analysisGeneration: number; graphFingerprint: string };
  changes: unknown[];
} {
  knownKeys(input, ['unitId', 'expected', 'changes']);
  const expected = objectArg(input.expected);
  knownKeys(expected, ['manuscriptGeneration', 'analysisGeneration', 'graphFingerprint']);
  if (!Array.isArray(input.changes)) throw new Error('desktop call changes must be a list');
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    expected: {
      manuscriptGeneration: requiredNumber(expected.manuscriptGeneration, 'manuscriptGeneration'),
      analysisGeneration: requiredNumber(expected.analysisGeneration, 'analysisGeneration'),
      graphFingerprint: requiredString(expected.graphFingerprint, 'graphFingerprint'),
    },
    changes: input.changes,
  };
}

function corpusQuery(input: Record<string, unknown>): CorpusQuery {
  knownKeys(input, [
    'manuscriptId',
    'text',
    'form',
    'gloss',
    'pos',
    'lexemeId',
    'senseId',
    'limit',
    'cursor',
  ]);
  const lexemeId = optionalQueryString(input, 'lexemeId');
  const senseId = optionalQueryString(input, 'senseId');
  if ((lexemeId === null) !== (senseId === null)) {
    throw new Error('sense query needs lexemeId and senseId');
  }
  return {
    manuscriptId: optionalQueryString(input, 'manuscriptId'),
    text: optionalQueryString(input, 'text'),
    form: optionalQueryString(input, 'form'),
    gloss: optionalQueryString(input, 'gloss'),
    pos: optionalQueryString(input, 'pos'),
    lexemeId,
    senseId,
    limit: requiredLimit(input.limit),
    cursor: corpusCursor(input.cursor),
  };
}

function optionalQueryString(input: Record<string, unknown>, name: string): string | null {
  if (!(name in input) || input[name] === null) return null;
  if (typeof input[name] !== 'string') throw new Error(`desktop call ${name} must be a string`);
  return input[name];
}

function requiredLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('desktop call limit must be a positive integer');
  }
  return value;
}

function corpusCursor(value: unknown): CorpusQueryCursor | null {
  if (value === undefined || value === null) return null;
  const cursor = objectArg(value);
  knownKeys(cursor, ['manuscriptId', 'layerId', 'startTime', 'unitId']);
  return {
    manuscriptId: requiredString(cursor.manuscriptId, 'manuscriptId'),
    layerId: requiredString(cursor.layerId, 'layerId'),
    startTime: requiredNumber(cursor.startTime, 'startTime'),
    unitId: requiredString(cursor.unitId, 'unitId'),
  };
}

function unitCreate(input: Record<string, unknown>): UnitCreate {
  knownKeys(input, [
    'layerId',
    'startTime',
    'endTime',
    'text',
    'speakerId',
    'parentUnitId',
    'fieldValues',
  ]);
  return {
    layerId: requiredString(input.layerId, 'layerId'),
    startTime: requiredNumber(input.startTime, 'startTime'),
    endTime: requiredNumber(input.endTime, 'endTime'),
    text: requiredString(input.text, 'text'),
    ...('speakerId' in input ? { speakerId: optionalString(input.speakerId, 'speakerId') } : {}),
    ...('parentUnitId' in input
      ? { parentUnitId: optionalString(input.parentUnitId, 'parentUnitId') }
      : {}),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function fieldValueMap(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('desktop call fieldValues must be an object');
  }
  return value as Record<string, unknown>;
}

function knownKeys(input: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new Error(`desktop call field ${key} is not supported`);
  }
}

function optionalString(value: unknown, name: string): string | null {
  if (value === null) return null;
  return requiredString(value, name);
}
