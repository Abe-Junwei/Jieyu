import { getDb, type LexemeDocType, type SpeakerDocType } from '../db';
import { newId } from '../utils/transcriptionFormatters';
import { getActiveProjectTextId } from '../utils/transcriptionUrlDeepLink';

export function resolveOwnedProjectTextId(explicit?: string): string {
  const given = explicit?.trim() ?? '';
  if (given.length > 0) return given;
  return getActiveProjectTextId().trim();
}

export async function claimUnscopedCatalog(textId: string): Promise<void> {
  const projectId = textId.trim();
  if (!projectId) return;
  const db = await getDb();
  const tables = [
    db.dexie.lexeme_assets,
    db.dexie.lexeme_asset_links,
    db.dexie.languages,
    db.dexie.language_display_names,
    db.dexie.language_aliases,
    db.dexie.language_catalog_history,
    db.dexie.orthographies,
    db.dexie.orthography_bridges,
    db.dexie.custom_field_definitions,
    db.dexie.phonemes,
    db.dexie.tag_definitions,
    db.dexie.locations,
    db.dexie.bibliographic_sources,
    db.dexie.grammar_docs,
    db.dexie.abbreviations,
  ];
  for (const table of tables) {
    const rows = (await table.toArray()) as Array<{ id?: string; textId?: string }>;
    for (const row of rows) {
      if (!row.id) continue;
      if (typeof row.textId === 'string' && row.textId.length > 0) continue;
      await table.update(row.id, { textId: projectId });
    }
  }
  const profileRows = await db.dexie.structural_rule_profiles.toArray();
  for (const row of profileRows) {
    if (typeof row.projectId === 'string' && row.projectId.length > 0) continue;
    await db.dexie.structural_rule_profiles.update(row.id, { projectId });
  }
  await claimSpeakers(projectId);
  await claimLexemes(projectId);
}

async function claimSpeakers(projectId: string): Promise<void> {
  const db = await getDb();
  const [speakers, units] = await Promise.all([
    db.dexie.speakers.toArray(),
    db.dexie.layer_units.toArray(),
  ]);
  const textsBySpeaker = new Map<string, Set<string>>();
  for (const unit of units) {
    const speakerId = unit.speakerId?.trim() ?? '';
    const owner = unit.textId?.trim() ?? '';
    if (!speakerId || !owner) continue;
    const texts = textsBySpeaker.get(speakerId) ?? new Set<string>();
    texts.add(owner);
    textsBySpeaker.set(speakerId, texts);
  }
  for (const speaker of speakers) {
    const ownedBy = speaker.textId?.trim() ?? '';
    const texts = [...(textsBySpeaker.get(speaker.id) ?? [])];
    if (ownedBy.length > 0 && ownedBy !== projectId) {
      if (texts.includes(projectId)) await cloneSpeakerForProject(speaker, projectId);
      continue;
    }
    if (texts.length > 1 && texts.includes(projectId)) {
      await cloneSpeakerForProject(speaker, projectId);
      continue;
    }
    if (texts.length === 1 && texts[0] !== projectId) continue;
    if (ownedBy.length > 0) continue;
    await db.dexie.speakers.update(speaker.id, { textId: projectId });
  }
}

async function cloneSpeakerForProject(speaker: SpeakerDocType, projectId: string): Promise<void> {
  const db = await getDb();
  const cloneId = newId('speaker');
  const now = new Date().toISOString();
  await db.dexie.speakers.put({
    ...speaker,
    id: cloneId,
    textId: projectId,
    updatedAt: now,
  });
  const units = await db.dexie.layer_units.where('textId').equals(projectId).toArray();
  for (const unit of units) {
    if (unit.speakerId !== speaker.id) continue;
    await db.dexie.layer_units.update(unit.id, { speakerId: cloneId });
  }
}

async function claimLexemes(projectId: string): Promise<void> {
  const db = await getDb();
  const [lexemes, links, tokens] = await Promise.all([
    db.dexie.lexemes.toArray(),
    db.dexie.token_lexeme_links.toArray(),
    db.dexie.unit_tokens.toArray(),
  ]);
  const tokenText = new Map(tokens.map((token) => [token.id, token.textId]));
  for (const lexeme of lexemes) {
    const ownedBy = lexeme.textId?.trim() ?? '';
    if (ownedBy.length > 0) continue;
    const texts = new Set<string>();
    for (const link of links) {
      if (link.lexemeId !== lexeme.id) continue;
      const owner = tokenText.get(link.targetId)?.trim() ?? '';
      if (owner.length > 0) texts.add(owner);
    }
    const owners = [...texts];
    if (owners.length === 0 || (owners.length === 1 && owners[0] === projectId)) {
      await db.dexie.lexemes.update(lexeme.id, { textId: projectId });
      continue;
    }
    if (!owners.includes(projectId)) continue;
    const cloneId = newId('lex');
    const now = new Date().toISOString();
    await db.dexie.lexemes.put({ ...lexeme, id: cloneId, textId: projectId, updatedAt: now });
    for (const link of links) {
      if (link.lexemeId !== lexeme.id) continue;
      if ((tokenText.get(link.targetId)?.trim() ?? '') !== projectId) continue;
      await db.dexie.token_lexeme_links.update(link.id, { lexemeId: cloneId });
    }
  }
}

export function lexemeBelongsToProject(lexeme: LexemeDocType, textId: string): boolean {
  return (lexeme.textId?.trim() ?? '') === textId.trim();
}
