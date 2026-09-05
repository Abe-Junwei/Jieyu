import {
  getDb,
  withTransaction,
  type LexemeAssetDocType,
  type LexemeAssetKind,
  type LexemeAssetLinkDocType,
} from '../db';
import { newId } from '../utils/transcriptionFormatters';
import { classifyLexemeAssetMime, LEXEME_ASSET_MAX_BYTES } from './lexemeAssetMime';

export {
  classifyLexemeAssetMime,
  lexemeAssetAcceptAttribute,
  LEXEME_ASSET_MAX_BYTES,
} from './lexemeAssetMime';

export type LexemeAttachmentView = {
  linkId: string;
  assetId: string;
  kind: LexemeAssetKind;
  mimeType: string;
  displayName: string;
  languageCode?: string;
  byteSize: number;
  blob?: Blob;
  blobOmitted: boolean;
  createdAt: string;
};

function toView(link: LexemeAssetLinkDocType, asset: LexemeAssetDocType): LexemeAttachmentView {
  return {
    linkId: link.id,
    assetId: asset.id,
    kind: asset.kind,
    mimeType: asset.mimeType,
    displayName: asset.displayName,
    ...(asset.languageCode ? { languageCode: asset.languageCode } : {}),
    byteSize: asset.byteSize,
    ...(asset.blob instanceof Blob ? { blob: asset.blob } : {}),
    blobOmitted: !(asset.blob instanceof Blob),
    createdAt: link.createdAt,
  };
}

export async function listLexemeAttachments(lexemeId: string): Promise<LexemeAttachmentView[]> {
  const db = await getDb();
  const links = await db.collections.lexeme_asset_links.findByIndex('lexemeId', lexemeId);
  const views: LexemeAttachmentView[] = [];
  for (const linkDoc of links) {
    const link = linkDoc.toJSON();
    const assetDoc = await db.collections.lexeme_assets
      .findOne({ selector: { id: link.assetId } })
      .exec();
    if (!assetDoc) continue;
    views.push(toView(link, assetDoc.toJSON()));
  }
  return views.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function attachLexemeFile(
  lexemeId: string,
  file: File | Blob,
  opts?: { displayName?: string; languageCode?: string },
): Promise<LexemeAttachmentView> {
  const mimeType = (file.type || '').trim().toLowerCase();
  const kind = classifyLexemeAssetMime(mimeType);
  if (!kind) throw new Error('UNSUPPORTED_TYPE');
  if (file.size === 0) throw new Error('EMPTY');
  if (file.size > LEXEME_ASSET_MAX_BYTES) throw new Error('TOO_LARGE');

  const db = await getDb();
  const lexeme = await db.collections.lexemes.findOne({ selector: { id: lexemeId } }).exec();
  if (!lexeme) throw new Error('NOT_FOUND');

  const now = new Date().toISOString();
  const assetId = newId('la');
  const linkId = newId('ll');
  const fileName = file instanceof File ? file.name.trim() : '';
  const displayName = opts?.displayName?.trim() || fileName || assetId;
  const languageCode = opts?.languageCode?.trim();

  const asset: LexemeAssetDocType = {
    id: assetId,
    kind,
    mimeType,
    displayName,
    ...(languageCode ? { languageCode } : {}),
    byteSize: file.size,
    refCount: 1,
    blob: file,
    createdAt: now,
    updatedAt: now,
  };
  const link: LexemeAssetLinkDocType = {
    id: linkId,
    lexemeId,
    assetId,
    createdAt: now,
  };

  await withTransaction(
    db,
    'rw',
    [db.dexie.lexeme_assets, db.dexie.lexeme_asset_links],
    async () => {
      await db.collections.lexeme_assets.insert(asset);
      await db.collections.lexeme_asset_links.insert(link);
    },
    { label: 'lexeme-asset-attach' },
  );

  return toView(link, asset);
}

export async function unlinkLexemeAttachment(linkId: string): Promise<void> {
  const db = await getDb();
  const linkDoc = await db.collections.lexeme_asset_links
    .findOne({ selector: { id: linkId } })
    .exec();
  if (!linkDoc) throw new Error('NOT_FOUND');
  const link = linkDoc.toJSON();

  await withTransaction(
    db,
    'rw',
    [db.dexie.lexeme_assets, db.dexie.lexeme_asset_links],
    async () => {
      await db.collections.lexeme_asset_links.remove(linkId);
      const assetDoc = await db.collections.lexeme_assets
        .findOne({ selector: { id: link.assetId } })
        .exec();
      if (!assetDoc) return;
      const asset = assetDoc.toJSON();
      const nextCount = asset.refCount - 1;
      if (nextCount <= 0) {
        await db.collections.lexeme_assets.remove(asset.id);
        return;
      }
      await db.collections.lexeme_assets.update(asset.id, {
        refCount: nextCount,
        updatedAt: new Date().toISOString(),
      });
    },
    { label: 'lexeme-asset-unlink' },
  );
}
