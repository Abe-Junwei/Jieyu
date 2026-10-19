import { getDb } from './engine';
import { dexieStoresForAnnotationImportRw } from './dexieTranscriptionGraphStores';
import { validateLayerLinkDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import {
  attachSourceToAnnotationDocument,
  deleteAnnotationDocumentUnitGraph,
} from './storagePortServiceAnnotationDocument';
import type {
  LayerLinkDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
  TextDocType,
  UserNoteDocType,
} from './types';
import { withTransaction } from './withTransaction';
import { syncUnitTextToSegmentationV2 } from '../services/LayerSegmentationTextService';
import { writeExtraEafTranscriptionTiers } from '../hooks/importExport/eafTranscriptionTierWrite';
import { importAdditionalTiers } from '../hooks/importExport/useImportExport.additionalTierHandlers';
import {
  buildImportLanguageNameMap,
  resolvePreferredHostTranscriptionLayerIdForTranslationImport,
  writeImportLayerNameAudit,
} from '../hooks/importExport/useImportExport.importHelpers';

function trimmed(id: string): string {
  return id.trim();
}

export async function withAnnotationImportTransaction<T>(scope: () => Promise<T>): Promise<T> {
  const database = await getDb();
  return withTransaction(database, 'rw', [...dexieStoresForAnnotationImportRw(database)], scope, {
    label: 'annotationImport.commit',
  });
}

export async function deleteAnnotationDocumentUnitGraphForImport(
  textId: string,
  documentId: string,
): Promise<void> {
  const database = await getDb();
  await deleteAnnotationDocumentUnitGraph(database, textId, documentId);
}

export async function attachImportedSourceToDocument(
  documentId: string,
  sourceId: string,
): Promise<void> {
  const database = await getDb();
  await attachSourceToAnnotationDocument(database, documentId, sourceId);
}

export async function resolvePreferredHostForTranslationImport(
  translationLayerId: string,
): Promise<string | undefined> {
  const database = await getDb();
  return resolvePreferredHostTranscriptionLayerIdForTranslationImport(database, translationLayerId);
}

export async function writeImportLayerNameAuditRow(
  input: Omit<Parameters<typeof writeImportLayerNameAudit>[0], 'db'>,
): Promise<void> {
  const database = await getDb();
  await writeImportLayerNameAudit({ ...input, db: database });
}

export async function importAdditionalTiersForCommit(
  input: Omit<Parameters<typeof importAdditionalTiers>[0], 'db'>,
): Promise<Awaited<ReturnType<typeof importAdditionalTiers>>> {
  const database = await getDb();
  return importAdditionalTiers({ ...input, db: database });
}

export async function buildImportLanguageNameMapForCommit(): Promise<Map<string, string>> {
  const database = await getDb();
  return buildImportLanguageNameMap(database);
}

export async function syncImportedUnitText(
  unit: LayerUnitDocType,
  content: LayerUnitContentDocType,
): Promise<void> {
  const database = await getDb();
  await syncUnitTextToSegmentationV2(database, unit, content);
}

export async function writeExtraEafTranscriptionTiersForCommit(
  input: Omit<Parameters<typeof writeExtraEafTranscriptionTiers>[0], 'db'>,
): Promise<void> {
  const database = await getDb();
  await writeExtraEafTranscriptionTiers({ ...input, db: database });
}

export async function putImportedMediaItem(row: MediaItemDocType): Promise<void> {
  const id = trimmed(row.id);
  if (id.length === 0) throw new StorageReadbackError('putImportedMediaItem');
  const next: MediaItemDocType = { ...row, id };
  const database = await getDb();
  await database.dexie.media_items.put(next);
  const stored = await database.dexie.media_items.get(id);
  if (!stored || stored.id !== id) throw new StorageReadbackError('putImportedMediaItem');
}

export async function putImportedTextRow(row: TextDocType): Promise<void> {
  const id = trimmed(row.id);
  if (id.length === 0) throw new StorageReadbackError('putImportedTextRow');
  const next: TextDocType = { ...row, id };
  const database = await getDb();
  await database.dexie.texts.put(next);
  const stored = await database.dexie.texts.get(id);
  if (!stored || stored.id !== id || stored.updatedAt !== next.updatedAt) {
    throw new StorageReadbackError('putImportedTextRow');
  }
}

export async function putImportedUserNote(row: UserNoteDocType): Promise<void> {
  const id = trimmed(row.id);
  if (id.length === 0) throw new StorageReadbackError('putImportedUserNote');
  const next: UserNoteDocType = { ...row, id };
  const database = await getDb();
  await database.dexie.user_notes.put(next);
  const stored = await database.dexie.user_notes.get(id);
  if (
    !stored ||
    stored.id !== id ||
    stored.textId !== next.textId ||
    stored.targetId !== next.targetId
  ) {
    throw new StorageReadbackError('putImportedUserNote');
  }
}

export async function insertImportedLayerLink(row: LayerLinkDocType): Promise<void> {
  const id = trimmed(row.id);
  if (id.length === 0) throw new StorageReadbackError('insertImportedLayerLink');
  const next: LayerLinkDocType = { ...row, id };
  validateLayerLinkDoc(next);
  const database = await getDb();
  await database.dexie.layer_links.put(next);
  const stored = await database.dexie.layer_links.get(id);
  if (!stored || stored.id !== id || stored.layerId !== next.layerId) {
    throw new StorageReadbackError('insertImportedLayerLink');
  }
}
