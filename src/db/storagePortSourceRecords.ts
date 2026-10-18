import { getDb } from './engine';
import type { SourceRecordDocType } from './types';
import { withTransaction } from './withTransaction';
import { newCatalogUuid } from '../services/projectCatalogScope';
import {
  planSourceImport,
  SourceMediaLinkError,
  SourceProjectNotFoundError,
  type SourceImportPlan,
} from '../services/sourceRecordPlan';

export type SourceRecordRegistration = {
  textId: string;
  originalName: string;
  format: string;
  importBatchId: string;
  sha256?: string;
  byteSize?: number;
  externalDocId?: string;
  mediaId?: string;
  linkedMediaFilename?: string;
};

function filled(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

async function unwrapSourceTransaction<T>(run: Promise<T>): Promise<T> {
  try {
    return await run;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof SourceMediaLinkError || cause instanceof SourceProjectNotFoundError) {
      throw cause;
    }
    throw error;
  }
}

async function assertMediaInProject(
  media: { get: (id: string) => Promise<{ textId: string } | undefined> },
  textId: string,
  mediaId: string,
): Promise<void> {
  const row = await media.get(mediaId);
  if (!row) throw new SourceMediaLinkError('media-missing', mediaId);
  if (row.textId !== textId) throw new SourceMediaLinkError('media-other-project', mediaId);
}

export async function listSourceRecordRows(textId: string): Promise<SourceRecordDocType[]> {
  const projectId = textId.trim();
  if (projectId.length === 0) return [];
  const database = await getDb();
  return database.dexie.source_records.where('textId').equals(projectId).toArray();
}

export async function registerImportedSourceRecord(
  input: SourceRecordRegistration,
): Promise<{ plan: SourceImportPlan; record: SourceRecordDocType }> {
  const database = await getDb();
  return unwrapSourceTransaction(
    withTransaction(
      database,
      'rw',
      [database.dexie.source_records, database.dexie.media_items, database.dexie.texts],
      async () => {
        if (!(await database.dexie.texts.get(input.textId))) {
          throw new SourceProjectNotFoundError(input.textId);
        }
        if (filled(input.mediaId)) {
          await assertMediaInProject(database.dexie.media_items, input.textId, input.mediaId);
        }
        const existing = await database.dexie.source_records
          .where('textId')
          .equals(input.textId)
          .toArray();
        const plan = planSourceImport(
          {
            textId: input.textId,
            originalName: input.originalName,
            format: input.format,
            ...(filled(input.sha256) ? { sha256: input.sha256 } : {}),
            ...(filled(input.externalDocId) ? { externalDocId: input.externalDocId } : {}),
          },
          existing,
        );
        const now = new Date().toISOString();
        const written =
          plan.kind === 'same-content'
            ? plan.record
            : plan.kind === 'update-existing'
              ? {
                  ...plan.record,
                  originalName: input.originalName,
                  format: input.format,
                  importedAt: now,
                  importBatchId: input.importBatchId,
                  updatedAt: now,
                  ...(filled(input.sha256) ? { sha256: input.sha256 } : {}),
                  ...(input.byteSize !== undefined ? { byteSize: input.byteSize } : {}),
                  ...(filled(input.mediaId) ? { mediaId: input.mediaId } : {}),
                  ...(filled(input.linkedMediaFilename)
                    ? { linkedMediaFilename: input.linkedMediaFilename }
                    : {}),
                }
              : {
                  id: newCatalogUuid(),
                  textId: input.textId,
                  originalName: input.originalName,
                  displayName: plan.displayName,
                  format: input.format,
                  importedAt: now,
                  importBatchId: input.importBatchId,
                  storedBytes: false,
                  updatedAt: now,
                  ...(input.byteSize !== undefined ? { byteSize: input.byteSize } : {}),
                  ...(filled(input.sha256) ? { sha256: input.sha256 } : {}),
                  ...(filled(input.externalDocId) ? { externalDocId: input.externalDocId } : {}),
                  ...(filled(input.mediaId) ? { mediaId: input.mediaId } : {}),
                  ...(filled(input.linkedMediaFilename)
                    ? { linkedMediaFilename: input.linkedMediaFilename }
                    : {}),
                };
        if (plan.kind === 'update-existing') await database.dexie.source_records.put(written);
        if (plan.kind === 'new') await database.dexie.source_records.add(written);
        const stored = await database.dexie.source_records.get(written.id);
        if (!stored || stored.textId !== input.textId || stored.sha256 !== written.sha256) {
          throw new Error(`source record ${written.id} did not read back as written`);
        }
        return { plan, record: stored };
      },
      { label: 'storage.registerImportedSource' },
    ),
  );
}

async function patchSourceRecordRow(
  textId: string,
  recordId: string,
  patch: (row: SourceRecordDocType) => SourceRecordDocType,
  label: string,
): Promise<SourceRecordDocType | undefined> {
  const database = await getDb();
  return unwrapSourceTransaction(
    withTransaction(
      database,
      'rw',
      [database.dexie.source_records, database.dexie.media_items, database.dexie.texts],
      async () => {
        const row = await database.dexie.source_records.get(recordId);
        if (!row || row.textId !== textId) return undefined;
        const next = patch(row);
        if (filled(next.mediaId)) {
          await assertMediaInProject(database.dexie.media_items, textId, next.mediaId);
        }
        await database.dexie.source_records.put(next);
        return next;
      },
      { label },
    ),
  );
}

export async function renameSourceRecordRow(
  textId: string,
  recordId: string,
  displayName: string,
): Promise<SourceRecordDocType | undefined> {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return undefined;
  return patchSourceRecordRow(
    textId,
    recordId,
    (row) => ({ ...row, displayName: trimmed, updatedAt: new Date().toISOString() }),
    'storage.renameSourceRecord',
  );
}

export async function linkSourceRecordMedia(
  textId: string,
  recordId: string,
  mediaId: string | null,
): Promise<SourceRecordDocType | undefined> {
  const target = mediaId?.trim() ?? '';
  return patchSourceRecordRow(
    textId,
    recordId,
    (row) => {
      const { mediaId: _previous, ...rest } = row;
      return {
        ...rest,
        ...(target.length > 0 ? { mediaId: target } : {}),
        updatedAt: new Date().toISOString(),
      };
    },
    'storage.linkSourceRecord',
  );
}
