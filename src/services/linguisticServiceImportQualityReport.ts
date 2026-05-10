import { getDb } from '../db';
import { listUnitTextsFromSegmentation } from './LayerSegmentationTextService';
import { listUnitDocsFromCanonicalLayerUnits } from './LayerSegmentGraphService';
import type { ImportQualityReport } from './LinguisticService.constraints';

export async function generateImportQualityReport(textId?: string): Promise<ImportQualityReport> {
  const db = await getDb();

  const [unitsAll, unitTextsAll, layersAll, tokensAll, morphemesAll, userNotesAll, anchorsAll] =
    await Promise.all([
      listUnitDocsFromCanonicalLayerUnits(db),
      listUnitTextsFromSegmentation(db),
      db.collections.layers
        .find()
        .exec()
        .then((docs) => docs.map((doc) => doc.toJSON())),
      db.dexie.unit_tokens.toArray(),
      db.dexie.unit_morphemes.toArray(),
      db.dexie.user_notes.toArray(),
      db.dexie.anchors.toArray(),
    ]);

  const inScopeUnits = textId ? unitsAll.filter((u) => u.textId === textId) : unitsAll;
  const inScopeUnitIds = new Set(inScopeUnits.map((u) => u.id));

  const inScopeUnitTexts = unitTextsAll.filter((row) =>
    Boolean(row.unitId && inScopeUnitIds.has(row.unitId)),
  );
  const inScopeTokens = tokensAll.filter((row) => inScopeUnitIds.has(row.unitId));
  const inScopeMorphemes = morphemesAll.filter((row) => inScopeUnitIds.has(row.unitId));

  const inScopeTokenIds = new Set(inScopeTokens.map((t) => t.id));
  const inScopeMorphemeIds = new Set(inScopeMorphemes.map((m) => m.id));
  const inScopeTranslationIds = new Set(inScopeUnitTexts.map((t) => t.id));

  const inScopeNotes = userNotesAll.filter((note) => {
    if (!textId) return true;
    if (note.targetType === 'unit') return inScopeUnitIds.has(note.targetId);
    if (note.targetType === 'translation') return inScopeTranslationIds.has(note.targetId);
    if (note.targetType === 'token') {
      return (
        inScopeTokenIds.has(note.targetId) ||
        (typeof note.parentTargetId === 'string' && inScopeUnitIds.has(note.parentTargetId))
      );
    }
    if (note.targetType === 'morpheme') {
      return (
        inScopeMorphemeIds.has(note.targetId) ||
        (typeof note.parentTargetId === 'string' && inScopeTokenIds.has(note.parentTargetId))
      );
    }
    return false;
  });

  const layerTypeById = new Map(layersAll.map((layer) => [layer.id, layer.layerType] as const));

  const transcribedUttIds = new Set<string>();
  const translatedUttIds = new Set<string>();
  const glossedUttIds = new Set<string>();
  const verifiedUttIds = new Set<string>();

  for (const utt of inScopeUnits) {
    const legacyTr = utt.transcription?.default;
    if (typeof legacyTr === 'string' && legacyTr.trim().length > 0) {
      transcribedUttIds.add(utt.id);
    }
    if (utt.annotationStatus === 'verified') {
      verifiedUttIds.add(utt.id);
    }
  }

  for (const row of inScopeUnitTexts) {
    const unitId = row.unitId?.trim();
    const layerId = row.layerId?.trim();
    const text = row.text?.trim() ?? '';
    if (!unitId || !layerId || !text) continue;
    const layerType = layerTypeById.get(layerId);
    if (layerType === 'transcription') transcribedUttIds.add(unitId);
    if (layerType === 'translation') translatedUttIds.add(unitId);
  }

  for (const token of inScopeTokens) {
    if (token.gloss && Object.keys(token.gloss).length > 0) {
      glossedUttIds.add(token.unitId);
      continue;
    }
    if (token.pos && token.pos.trim().length > 0) {
      glossedUttIds.add(token.unitId);
    }
  }
  for (const morph of inScopeMorphemes) {
    if (morph.gloss && Object.keys(morph.gloss).length > 0) {
      glossedUttIds.add(morph.unitId);
      continue;
    }
    if (morph.pos && morph.pos.trim().length > 0) {
      glossedUttIds.add(morph.unitId);
    }
  }

  const unitById = new Set(inScopeUnits.map((u) => u.id));
  const tokenById = new Set(inScopeTokens.map((u) => u.id));
  const morphemeById = new Set(inScopeMorphemes.map((u) => u.id));
  const translationById = new Set(inScopeUnitTexts.map((u) => u.id));

  let orphanNotes = 0;
  for (const note of inScopeNotes) {
    if (note.targetType === 'unit' && !unitById.has(note.targetId)) orphanNotes++;
    if (note.targetType === 'token' && !tokenById.has(note.targetId)) orphanNotes++;
    if (note.targetType === 'morpheme' && !morphemeById.has(note.targetId)) orphanNotes++;
    if (note.targetType === 'translation' && !translationById.has(note.targetId)) orphanNotes++;
  }

  const referencedAnchors = new Set<string>();
  for (const utt of inScopeUnits) {
    if (utt.startAnchorId) referencedAnchors.add(utt.startAnchorId);
    if (utt.endAnchorId) referencedAnchors.add(utt.endAnchorId);
  }
  let orphanAnchors = 0;
  for (const anchor of anchorsAll) {
    if (!referencedAnchors.has(anchor.id)) orphanAnchors++;
  }

  const totalUnits = inScopeUnits.length;
  const ratio = (part: number): number => (totalUnits === 0 ? 0 : part / totalUnits);

  const transcriptionLayers = layersAll.filter((l) => l.layerType === 'transcription');
  const translationLayers = layersAll.filter((l) => l.layerType === 'translation');
  const inScopeTextIds = new Set(inScopeUnits.map((u) => u.textId));

  return {
    generatedAt: new Date().toISOString(),
    scope: textId ? { textId } : {},
    totals: {
      units: totalUnits,
      unitTexts: inScopeUnitTexts.length,
      transcriptionLayers: transcriptionLayers.filter((l) => inScopeTextIds.has(l.textId)).length,
      translationLayers: translationLayers.filter((l) => inScopeTextIds.has(l.textId)).length,
      canonicalTokens: inScopeTokens.length,
      canonicalMorphemes: inScopeMorphemes.length,
      userNotes: inScopeNotes.length,
    },
    coverage: {
      transcribedUnits: transcribedUttIds.size,
      translatedUnits: translatedUttIds.size,
      glossedUnits: glossedUttIds.size,
      verifiedUnits: verifiedUttIds.size,
      transcribedRate: ratio(transcribedUttIds.size),
      translatedRate: ratio(translatedUttIds.size),
      glossedRate: ratio(glossedUttIds.size),
      verifiedRate: ratio(verifiedUttIds.size),
    },
    integrity: {
      orphanNotes,
      orphanAnchors,
    },
  };
}
