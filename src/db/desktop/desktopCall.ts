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
import { consumeExchangePath } from '../../desktop/exchangePathGrant';
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
import { clearLayerHosts, placeLayer, previewLayerHosts, setLayerHosts } from './layerHosts';
import { createLayer, listLayerLinks, listLayers } from './layers';
import {
  deleteLayer,
  listDeletedLayers,
  moveLayer,
  renameLayer,
  restoreLayer,
  setLayerHeight,
} from './layerStructure';
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
import { registerRecording } from './registerRecording';
import {
  attachRecording,
  createRecordingPair,
  detachRecording,
  dropOralEngine,
  listRecordings,
  oralProvenanceJson,
  peekOralEngine,
  proposeOralDraft,
  readRecording,
} from './recordingClips';
import { transcribeWavClip } from '../../desktop/projectTranscription';
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
  retimeManuscript,
  restoreManuscript,
} from './manuscripts';
import {
  desktopSessionFolder,
  reopenDesktopSession,
  requireDesktopSession,
} from './projectSession';
import {
  clearSessionEdit,
  dropSessionEdit,
  rememberSessionEdit,
  redoSessionEdit,
  sessionEditManuscript,
  undoSessionEdit,
} from './sessionEdit';
import { desktopOperations, isDesktopOperation, type DesktopOperations } from './operationContract';
import {
  createUnit,
  getUnit,
  listUnits,
  readStoredUnit,
  updateBoundary,
  setUnitSkipProcessing,
  updateUnitText,
  type UnitTextUndo,
} from './units';
import {
  discardUnitTextDraft,
  inspectUnitTextSave,
  putUnitTextDraft,
  readUnitTextDraft,
  textSaveDigest,
} from './textSave';
import { resolveUnitTextContext } from './unitTextLayers';
import { mergeUnits, readRemovedUnit, splitUnit } from './unitSpan';
import {
  manuscriptIdOf,
  moveSharedBoundary,
  moveUnitEdge,
  moveUnitSpan,
  previewUnitDeletion,
  timedDescendants,
  removeUnit,
} from './unitEdges';
import { inspectEditReceipt, withEditReceipt, type EditReceiptKind } from './editReceipts';
import { discardUnitTimeDraft, putUnitTimeDraft, readUnitTimeDrafts } from './unitTimeDrafts';

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

const EDIT_METHODS = {
  create: 'units.create',
  moveEdge: 'units.moveEdge',
  moveSharedBoundary: 'units.moveSharedBoundary',
  moveUnit: 'units.moveUnit',
  delete: 'units.delete',
  undo: 'units.undo',
  redo: 'units.redo',
} as const satisfies Record<EditReceiptKind, keyof DesktopOperations>;

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
  'layers.listLinks': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.listLinks']['check']>) =>
      listLayerLinks(ctx.db, input.manuscriptId),
  },
  'layers.previewHosts': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.previewHosts']['check']>) =>
      previewLayerHosts(ctx.db, input),
  },
  'layers.setHosts': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.setHosts']['check']>) =>
      setLayerHosts(ctx.db, input),
  },
  'layers.clearHosts': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.clearHosts']['check']>) => {
      clearLayerHosts(ctx.db, input);
      return { layerId: input.layerId };
    },
  },
  'layers.place': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.place']['check']>) => {
      placeLayer(ctx.db, input);
      return { layerId: input.layerId };
    },
  },
  'layers.rename': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.rename']['check']>) =>
      renameLayer(ctx.db, input),
  },
  'layers.setHeight': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.setHeight']['check']>) =>
      setLayerHeight(ctx.db, input),
  },
  'layers.move': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.move']['check']>) =>
      moveLayer(ctx.db, input),
  },
  'layers.delete': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.delete']['check']>) =>
      deleteLayer(ctx.db, input),
  },
  'layers.listDeleted': {
    run: (ctx: ContractCtx) => listDeletedLayers(ctx.db),
  },
  'layers.restore': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['layers.restore']['check']>) =>
      restoreLayer(ctx.db, input.id),
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
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.create']['check']>) => {
      const { operationId, ...create } = input;
      return withEditReceipt(
        ctx.db,
        {
          operationId,
          kind: 'create',
          payload: create,
          manuscriptId: (unit) => manuscriptIdOf(ctx.db, unit.id),
        },
        () => {
          const unit = createUnit(ctx.db, create);
          rememberSessionEdit(ctx.sessionId, {
            kind: 'create',
            undo: {
              manuscriptId: manuscriptIdOf(ctx.db, unit.id),
              tree: readRemovedUnit(ctx.db, unit.id),
            },
          });
          return unit;
        },
      );
    },
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
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.undo']['check']>) => {
      const stackManuscript = sessionEditManuscript(ctx.sessionId, input.manuscriptId) ?? '-';
      return withEditReceipt(
        ctx.db,
        {
          operationId: input.operationId,
          kind: 'undo',
          payload: input,
          manuscriptId: () => stackManuscript,
        },
        () => undoSessionEdit(ctx.sessionId, ctx.db, undefined, input.manuscriptId),
      );
    },
  },
  'units.redo': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.redo']['check']>) => {
      const stackManuscript = sessionEditManuscript(ctx.sessionId, input.manuscriptId) ?? '-';
      return withEditReceipt(
        ctx.db,
        {
          operationId: input.operationId,
          kind: 'redo',
          payload: input,
          manuscriptId: () => stackManuscript,
        },
        () => redoSessionEdit(ctx.sessionId, ctx.db, input.manuscriptId),
      );
    },
  },
  'units.dropUndo': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.dropUndo']['check']>) => ({
      dropped: dropSessionEdit(ctx.sessionId, 'undo', input.manuscriptId),
    }),
  },
  'units.dropRedo': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.dropRedo']['check']>) => ({
      dropped: dropSessionEdit(ctx.sessionId, 'redo', input.manuscriptId),
    }),
  },
  'units.inspectEdit': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.inspectEdit']['check']>) => {
      const method = EDIT_METHODS[input.kind];
      const check = desktopOperations[method].check as (raw: Record<string, unknown>) => object;
      const { operationId: _ignored, ...payload } = check(input.payload) as Record<string, unknown>;
      return inspectEditReceipt(ctx.db, { ...input, payload });
    },
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
    ) => {
      const before = readStoredUnit(ctx.db, input.leftId);
      const right = readStoredUnit(ctx.db, input.rightId);
      const moved = updateBoundary(ctx.db, input);
      if (before?.startMs != null && before.endMs != null && right?.endMs != null) {
        rememberSessionEdit(ctx.sessionId, {
          kind: 'boundary',
          undo: {
            leftId: input.leftId,
            rightId: input.rightId,
            from: before.endMs,
            to: input.time,
            leftStart: before.startMs,
            rightEnd: right.endMs,
            manuscriptId: manuscriptIdOf(ctx.db, input.leftId),
          },
        });
      }
      return moved;
    },
  },
  'units.moveEdge': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.moveEdge']['check']>) => {
      const { operationId, ...move } = input;
      return withEditReceipt(
        ctx.db,
        {
          operationId,
          kind: 'moveEdge',
          payload: move,
          manuscriptId: () => manuscriptIdOf(ctx.db, move.unitId),
        },
        () => {
          const moved = moveUnitEdge(ctx.db, move);
          if (moved.move) {
            rememberSessionEdit(ctx.sessionId, { kind: 'edge', undo: moved.move });
            discardUnitTimeDraft(ctx.db, move.unitId, move.edge);
            for (const follower of moved.move.followers ?? []) {
              discardUnitTimeDraft(ctx.db, follower.unitId);
            }
          }
          return moved.unit;
        },
      );
    },
  },
  'units.moveSharedBoundary': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['units.moveSharedBoundary']['check']>,
    ) => {
      const { operationId, ...move } = input;
      return withEditReceipt(
        ctx.db,
        {
          operationId,
          kind: 'moveSharedBoundary',
          payload: move,
          manuscriptId: () => manuscriptIdOf(ctx.db, move.leftId),
        },
        () => {
          const moved = moveSharedBoundary(ctx.db, move);
          if (moved.move) {
            rememberSessionEdit(ctx.sessionId, { kind: 'boundary', undo: moved.move });
            discardUnitTimeDraft(ctx.db, move.leftId, 'end');
            discardUnitTimeDraft(ctx.db, move.rightId, 'start');
          }
          return { left: moved.left, right: moved.right };
        },
      );
    },
  },
  'units.moveUnit': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.moveUnit']['check']>) => {
      const { operationId, ...move } = input;
      return withEditReceipt(
        ctx.db,
        {
          operationId,
          kind: 'moveUnit',
          payload: move,
          manuscriptId: () => manuscriptIdOf(ctx.db, move.unitId),
        },
        () => {
          const moved = moveUnitSpan(ctx.db, move);
          if (moved.move) {
            rememberSessionEdit(ctx.sessionId, { kind: 'span', undo: moved.move });
            discardUnitTimeDraft(ctx.db, move.unitId);
            for (const child of timedDescendants(ctx.db, move.unitId)) {
              discardUnitTimeDraft(ctx.db, child.id);
            }
          }
          return moved.unit;
        },
      );
    },
  },
  'units.deletePreview': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.deletePreview']['check']>) =>
      previewUnitDeletion(ctx.db, input.unitId),
  },
  'units.delete': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.delete']['check']>) => {
      const { operationId, unitId } = input;
      let manuscriptId = '';
      return withEditReceipt(
        ctx.db,
        { operationId, kind: 'delete', payload: { unitId }, manuscriptId: () => manuscriptId },
        () => {
          manuscriptId = manuscriptIdOf(ctx.db, unitId);
          const tree = removeUnit(ctx.db, unitId);
          rememberSessionEdit(ctx.sessionId, { kind: 'delete', undo: { manuscriptId, tree } });
          return { id: unitId };
        },
      );
    },
  },
  'units.readTimeDraft': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.readTimeDraft']['check']>) =>
      readUnitTimeDrafts(ctx.db, input.unitId),
  },
  'units.putTimeDraft': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.putTimeDraft']['check']>) =>
      putUnitTimeDraft(ctx.db, input),
  },
  'units.discardTimeDraft': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['units.discardTimeDraft']['check']>,
    ) => {
      discardUnitTimeDraft(ctx.db, input.unitId, input.edge);
      return null;
    },
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
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['exchange.importFile']['check']>,
    ) => {
      const file = consumeExchangePath(ctx.sessionId, input.grantId, 'import');
      const roles =
        input.rolesGrantId === undefined
          ? undefined
          : consumeExchangePath(ctx.sessionId, input.rolesGrantId, 'import-roles');
      return importForeignFile({
        folder: ctx.folder,
        file,
        db: ctx.db,
        ...(roles === undefined ? {} : { roles }),
      });
    },
  },
  'exchange.exportJyt': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['exchange.exportJyt']['check']>,
    ) => {
      const file = consumeExchangePath(ctx.sessionId, input.grantId, 'export');
      assertExportTarget(ctx.folder, file, mediaRelpaths(ctx.db));
      return saveDesktopPackage(file, exportDesktopJyt(ctx.db));
    },
  },
  'exchange.exportJym': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['exchange.exportJym']['check']>,
    ) => {
      const file = consumeExchangePath(ctx.sessionId, input.grantId, 'export');
      assertExportTarget(ctx.folder, file, mediaRelpaths(ctx.db));
      return saveDesktopPackage(file, exportDesktopJym(ctx.db, ctx.folder));
    },
  },
  'exchange.exportManuscript': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['exchange.exportManuscript']['check']>,
    ) => {
      const file = consumeExchangePath(ctx.sessionId, input.grantId, 'export');
      assertExportTarget(ctx.folder, file, mediaRelpaths(ctx.db));
      return saveDesktopPackage(file, exportDesktopManuscriptJyt(ctx.db, [input.manuscriptId]));
    },
  },
  'units.setSkipProcessing': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['units.setSkipProcessing']['check']>,
    ) => setUnitSkipProcessing(ctx.db, input),
  },
  'units.updateText': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.updateText']['check']>) => {
      const draft =
        input.textLayerId === undefined
          ? null
          : readUnitTextDraft(ctx.db, input.unitId, input.textLayerId);
      const matching = draft !== null && draft.rawInput === input.text;
      const engine =
        !matching && input.textLayerId !== undefined
          ? peekOralEngine(input.unitId, input.textLayerId)
          : undefined;
      const provenanceJson = matching
        ? draft.provenanceJson
        : engine === undefined
          ? undefined
          : oralProvenanceJson(engine);
      const box: { undo: UnitTextUndo | null } = { undo: null };
      const unit = updateUnitText(
        ctx.db,
        provenanceJson === undefined ? input : { ...input, provenanceJson },
        undefined,
        (undo) => {
          box.undo = undo;
        },
      );
      if (input.textLayerId !== undefined) dropOralEngine(input.unitId, input.textLayerId);
      return { value: unit, undo: box.undo };
    },
    remember: (sessionId, undo) => {
      rememberSessionEdit(sessionId, { kind: 'text', undo });
    },
  },
  'units.inspectTextSave': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['units.inspectTextSave']['check']>,
    ) => {
      const context = resolveUnitTextContext(ctx.db, input.unitId, input.textLayerId);
      return inspectUnitTextSave(
        ctx.db,
        input.operationId,
        textSaveDigest(input.unitId, context.textLayerId, input.text),
      );
    },
  },
  'units.readTextDraft': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.readTextDraft']['check']>) =>
      readUnitTextDraft(ctx.db, input.unitId, input.textLayerId),
  },
  'units.putTextDraft': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['units.putTextDraft']['check']>) =>
      putUnitTextDraft(ctx.db, input),
  },
  'units.discardTextDraft': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['units.discardTextDraft']['check']>,
    ) => {
      discardUnitTextDraft(ctx.db, input.unitId, input.textLayerId);
      if (input.textLayerId !== undefined) dropOralEngine(input.unitId, input.textLayerId);
      return null;
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
  'recordings.register': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['recordings.register']['check']>) =>
      registerRecording(ctx.db, ctx.folder, input),
  },
  'recordings.createPair': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['recordings.createPair']['check']>,
    ) => createRecordingPair(ctx.db, input),
  },
  'recordings.attach': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['recordings.attach']['check']>) =>
      attachRecording(ctx.db, ctx.folder, input),
  },
  'recordings.detach': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['recordings.detach']['check']>) =>
      detachRecording(ctx.db, input),
  },
  'recordings.read': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['recordings.read']['check']>) =>
      readRecording(ctx.db, ctx.folder, input),
  },
  'recordings.list': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['recordings.list']['check']>) =>
      listRecordings(ctx.db, input.layerId),
  },
  'recordings.transcribe': {
    run: async (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['recordings.transcribe']['check']>,
    ) => {
      const clip = readRecording(ctx.db, ctx.folder, {
        unitId: input.unitId,
        layerId: input.layerId,
      });
      const heard = await transcribeWavClip(ctx.sessionId, clip.bytes);
      return proposeOralDraft(ctx.db, {
        unitId: input.unitId,
        audioLayerId: input.layerId,
        text: heard.text,
        model: heard.model,
        modelVersion: heard.modelVersion,
      });
    },
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
  'manuscripts.retime': {
    run: (
      ctx: ContractCtx,
      input: ReturnType<DesktopOperations['manuscripts.retime']['check']>,
    ) => {
      const retimed = retimeManuscript(ctx.db, input);
      rememberSessionEdit(ctx.sessionId, {
        kind: 'retime',
        undo: retimed.undo,
        offsetMs: input.offsetMs,
        scale: input.scale,
      });
      return { count: retimed.count };
    },
  },
  'manuscripts.purge': {
    run: (ctx: ContractCtx, input: ReturnType<DesktopOperations['manuscripts.purge']['check']>) =>
      purgeManuscript(ctx.db, input.id),
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
