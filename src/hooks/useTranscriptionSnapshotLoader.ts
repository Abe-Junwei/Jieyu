import { useCallback } from 'react';
import { getDb } from '../../db';
import type {
  AnchorDocType,
  LayerLinkDocType,
  MediaItemDocType,
  SpeakerDocType,
  TranslationLayerDocType,
  UtteranceDocType,
  UtteranceMorphemeDocType,
  UtteranceTextDocType,
  UtteranceTokenDocType,
} from '../../db';
import type { DbState } from './transcriptionTypes';

type Params = {
  dbNameRef: React.MutableRefObject<string | undefined>;
  setAnchors: React.Dispatch<React.SetStateAction<AnchorDocType[]>>;
  setLayerLinks: React.Dispatch<React.SetStateAction<LayerLinkDocType[]>>;
  setLayers: React.Dispatch<React.SetStateAction<TranslationLayerDocType[]>>;
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItemDocType[]>>;
  setSpeakers: React.Dispatch<React.SetStateAction<SpeakerDocType[]>>;
  setSelectedLayerId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedUtteranceId: React.Dispatch<React.SetStateAction<string>>;
  setState: React.Dispatch<React.SetStateAction<DbState>>;
  setTranslations: React.Dispatch<React.SetStateAction<UtteranceTextDocType[]>>;
  setUtteranceDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setUtterances: React.Dispatch<React.SetStateAction<UtteranceDocType[]>>;
};

export function useTranscriptionSnapshotLoader({
  dbNameRef,
  setAnchors,
  setLayerLinks,
  setLayers,
  setMediaItems,
  setSpeakers,
  setSelectedLayerId,
  setSelectedUtteranceId,
  setState,
  setTranslations,
  setUtteranceDrafts,
  setUtterances,
}: Params) {
  const loadSnapshot = useCallback(async () => {
    const db = await getDb();
    const [
      utteranceDocs,
      anchorDocs,
      layerDocs,
      translationDocs,
      mediaDocs,
      speakerDocs,
      linkDocs,
      tokenDocs,
      morphemeDocs,
    ] = await Promise.all([
      db.collections.utterances.find().exec(),
      db.collections.anchors.find().exec(),
      db.collections.translation_layers.find().exec(),
      db.collections.utterance_texts.find().exec(),
      db.collections.media_items.find().exec(),
      db.collections.speakers.find().exec(),
      db.collections.layer_links.find().exec(),
      db.collections.utterance_tokens.find().exec(),
      db.collections.utterance_morphemes.find().exec(),
    ]);

    const utteranceRowsRaw = utteranceDocs.map((doc) => doc.toJSON() as unknown as UtteranceDocType);
    const anchorRows = anchorDocs.map((doc) => doc.toJSON() as unknown as AnchorDocType);
    const allLayerRows = layerDocs.map((doc) => doc.toJSON() as unknown as TranslationLayerDocType);
    const translationRows = translationDocs.map(
      (doc) => doc.toJSON() as unknown as UtteranceTextDocType,
    );
    const mediaRows = mediaDocs.map((doc) => doc.toJSON() as unknown as MediaItemDocType);
      const speakerRows = speakerDocs.map((doc) => doc.toJSON() as unknown as SpeakerDocType);
    const linkRows = linkDocs.map((doc) => doc.toJSON() as unknown as LayerLinkDocType);
    const tokenRows = tokenDocs
      .map((doc) => doc.toJSON() as unknown as UtteranceTokenDocType)
      .sort((a, b) => {
        if (a.utteranceId === b.utteranceId) return a.tokenIndex - b.tokenIndex;
        return a.utteranceId.localeCompare(b.utteranceId);
      });
    const morphemeRows = morphemeDocs
      .map((doc) => doc.toJSON() as unknown as UtteranceMorphemeDocType)
      .sort((a, b) => {
        if (a.tokenId === b.tokenId) return a.morphemeIndex - b.morphemeIndex;
        return a.tokenId.localeCompare(b.tokenId);
      });

    const tokensByUtterance = new Map<string, UtteranceTokenDocType[]>();
    tokenRows.forEach((token) => {
      const list = tokensByUtterance.get(token.utteranceId) ?? [];
      list.push(token);
      tokensByUtterance.set(token.utteranceId, list);
    });
    const morphemesByToken = new Map<string, UtteranceMorphemeDocType[]>();
    morphemeRows.forEach((morpheme) => {
      const list = morphemesByToken.get(morpheme.tokenId) ?? [];
      list.push(morpheme);
      morphemesByToken.set(morpheme.tokenId, list);
    });

    const utteranceRows = utteranceRowsRaw.map((row) => {
      const canonicalTokens = tokensByUtterance.get(row.id);
      if (!canonicalTokens || canonicalTokens.length === 0) {
        return row;
      }

      const words = canonicalTokens.map((token) => {
        const canonicalMorphemes = morphemesByToken.get(token.id) ?? [];
        return {
          id: token.id,
          form: token.form,
          ...(token.gloss ? { gloss: token.gloss } : {}),
          ...(token.pos ? { pos: token.pos } : {}),
          ...(token.lexemeId ? { lexemeId: token.lexemeId } : {}),
          ...(token.provenance ? { provenance: token.provenance } : {}),
          ...(canonicalMorphemes.length > 0
            ? {
                morphemes: canonicalMorphemes.map((morph) => ({
                  id: morph.id,
                  form: morph.form,
                  ...(morph.gloss ? { gloss: morph.gloss } : {}),
                  ...(morph.pos ? { pos: morph.pos } : {}),
                  ...(morph.lexemeId ? { lexemeId: morph.lexemeId } : {}),
                  ...(morph.provenance ? { provenance: morph.provenance } : {}),
                })),
              }
            : {}),
        };
      });

      return {
        ...row,
        words,
      };
    });

    const activeTextId = utteranceRows[0]?.textId;
    const layerRows = activeTextId
      ? allLayerRows.filter((l) => l.textId === activeTextId)
      : allLayerRows;

    setUtterances(utteranceRows);
    setAnchors(anchorRows);
    setLayers(layerRows);
    setTranslations(translationRows);
    setMediaItems(mediaRows);
    setSpeakers(speakerRows);
    setLayerLinks(linkRows);
    setUtteranceDrafts(() => {
      const next: Record<string, string> = {};
      utteranceRows.forEach((row) => {
        const defaultTrcLayer = layerRows.find((l) => l.layerType === 'transcription' && l.isDefault)
          ?? layerRows.find((l) => l.layerType === 'transcription');
        if (defaultTrcLayer) {
          const tr = translationRows.find(
            (t) => t.utteranceId === row.id && t.tierId === defaultTrcLayer.id,
          );
          next[row.id] = tr?.text ?? '';
        } else {
          next[row.id] = row.transcription?.default ?? '';
        }
      });
      return next;
    });

    setSelectedUtteranceId((prev) => {
      if (!prev && utteranceRows[0]) return utteranceRows[0].id;
      return prev;
    });
    setSelectedLayerId((prev) => {
      if (!prev) {
        const first = layerRows.find((item) => item.layerType === 'translation');
        if (first) return first.id;
      }
      return prev;
    });

    dbNameRef.current = db.name;
    setState({
      phase: 'ready',
      dbName: db.name,
      utteranceCount: utteranceRows.length,
      translationLayerCount: layerRows.length,
      translationRecordCount: translationRows.length,
    });
  }, [
    dbNameRef,
    setAnchors,
    setLayerLinks,
    setLayers,
    setMediaItems,
    setSpeakers,
    setSelectedLayerId,
    setSelectedUtteranceId,
    setState,
    setTranslations,
    setUtteranceDrafts,
    setUtterances,
  ]);

  return {
    loadSnapshot,
  };
}