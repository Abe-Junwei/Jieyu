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
import type { Manuscript, ManuscriptCreate } from './manuscripts';
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
import type { AnalysisRoot, Unit, UnitCreate } from './units';
import type { ContentNote, ContentNoteQuery, ContentNoteWrite } from './notes';
import type { JieyuAnchoredNote } from '../dmlexTypes';

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
    listLayers: (sessionId: string, manuscriptId: string) =>
      once<Layer[]>(sessionId, 'layers.list', { manuscriptId }),
    listUnits: (sessionId: string, layerId: string) =>
      once<Unit[]>(sessionId, 'units.list', { layerId }),
    updateUnitText: (sessionId: string, input: { unitId: string; text: string }) =>
      once<Unit>(sessionId, 'units.updateText', input),
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
    saveLexemeEntry: (sessionId: string, input: LexemeSave) =>
      once<ProjectLexeme>(sessionId, 'lexicon.saveEntry', input),
    getLexemeEntry: (sessionId: string, id: string) =>
      once<ProjectLexeme | null>(sessionId, 'lexicon.getEntry', { id }),
    linkSense: (sessionId: string, input: LexemeLinkWrite & { lexemeId: string }) =>
      once<ProjectLexemeLink>(sessionId, 'lexicon.linkSense', input),
    removeSense: (sessionId: string, input: { lexemeId: string; senseId: string }) =>
      once<ProjectLexeme>(sessionId, 'lexicon.removeSense', input),
    createNote: (sessionId: string, input: ContentNoteWrite) =>
      once<ContentNote>(sessionId, 'notes.create', input),
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
    reopen: (sessionId: string) => once<{ reopened: true }>(sessionId, 'reopen', {}),
    patchSource: (sessionId: string, input: SourcePatch) =>
      once<SourceReading>(sessionId, 'sources.patch', input),
    redeliverSource: (sessionId: string, operationId: string) =>
      once<SourceReading>(sessionId, 'sources.redeliver', { operationId }),
  };
}
