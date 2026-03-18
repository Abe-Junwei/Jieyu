import { useCallback, useRef, useState } from 'react';
import { getDb } from '../../db';
import { useClickOutside } from './useClickOutside';
import type {
  AnchorDocType,
  MediaItemDocType,
  TranslationLayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../../db';
import type { SaveState } from './useTranscriptionData';
import { LinguisticService } from '../../services/LinguisticService';
import { validateLayerTierConsistency } from '../../services/TierBridgeService';
import { LayerTierUnifiedService } from '../../services/LayerTierUnifiedService';
import { exportToEaf, importFromEaf, downloadEaf, readFileAsText } from '../../services/EafService';
import type { EafImportResult } from '../../services/EafService';
import { exportToTextGrid, importFromTextGrid, downloadTextGrid } from '../../services/TextGridService';
import type { TextGridImportResult } from '../../services/TextGridService';
import { exportToTrs, importFromTrs, downloadTrs } from '../../services/TranscriberService';
import { exportToFlextext, importFromFlextext, downloadFlextext } from '../../services/FlexService';
import { exportToToolbox, importFromToolbox, downloadToolbox } from '../../services/ToolboxService';
import { normalizeUtteranceTextDocForStorage } from '../utils/camDataUtils';
import { downloadJieyuArchive, importJieyuArchiveFile } from '../../services/JymService';
import { detectLocale, t, tf } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { newId } from '../utils/transcriptionFormatters';

interface UseImportExportInput {
  activeTextId: string | null;
  getActiveTextId: () => Promise<string | null>;
  selectedUtteranceMedia: MediaItemDocType | undefined;
  utterancesOnCurrentMedia: UtteranceDocType[];
  anchors: AnchorDocType[];
  layers: TranslationLayerDocType[];
  translations: UtteranceTextDocType[];
  defaultTranscriptionLayerId: string | undefined;
  loadSnapshot: () => Promise<void>;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
}

export function useImportExport(input: UseImportExportInput) {
  const locale = detectLocale();
  const {
    activeTextId,
    getActiveTextId,
    selectedUtteranceMedia,
    utterancesOnCurrentMedia,
    anchors,
    layers,
    translations,
    defaultTranscriptionLayerId,
    loadSnapshot,
    setSaveState,
  } = input;

  const importFileRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Use centralized click-outside pattern to avoid race condition with click handlers
  useClickOutside(
    exportMenuRef as React.RefObject<HTMLElement | null>,
    () => setShowExportMenu(false),
    { closeOnEscape: true },
  );

  const fetchUtteranceNotes = useCallback(async (uttIds: string[]) => {
    if (uttIds.length === 0) return [];
    const { db: dexie } = await import('../../db');
    return dexie.user_notes
      .where('[targetType+targetId]')
      .anyOf(uttIds.map((id) => ['utterance', id]))
      .toArray();
  }, []);

  const handleExportEaf = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const userNotes = await fetchUtteranceNotes(utterancesOnCurrentMedia.map((u) => u.id));
    const xml = exportToEaf({
      ...(selectedUtteranceMedia ? { mediaItem: selectedUtteranceMedia } : {}),
      utterances: utterancesOnCurrentMedia,
      anchors,
      layers,
      translations,
      userNotes,
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    downloadEaf(xml, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.eaf') });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, utterancesOnCurrentMedia, anchors, layers, translations, setSaveState, fetchUtteranceNotes]);

  const handleExportTextGrid = useCallback(async () => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const userNotes = await fetchUtteranceNotes(utterancesOnCurrentMedia.map((u) => u.id));
    const tg = exportToTextGrid({
      utterances: utterancesOnCurrentMedia,
      layers,
      translations,
      userNotes,
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    downloadTextGrid(tg, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.textgrid') });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, utterancesOnCurrentMedia, layers, translations, setSaveState, fetchUtteranceNotes]);

  const handleExportTrs = useCallback(() => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const trs = exportToTrs({
      utterances: utterancesOnCurrentMedia,
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    downloadTrs(trs, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.trs') });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, utterancesOnCurrentMedia, setSaveState]);

  const handleExportFlextext = useCallback(() => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const flex = exportToFlextext({
      utterances: utterancesOnCurrentMedia,
      layers,
      translations,
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    downloadFlextext(flex, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.flextext') });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, utterancesOnCurrentMedia, layers, translations, setSaveState]);

  const handleExportToolbox = useCallback(() => {
    if (utterancesOnCurrentMedia.length === 0) return;
    const toolbox = exportToToolbox({
      utterances: utterancesOnCurrentMedia,
      layers,
      translations,
    });
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'export';
    downloadToolbox(toolbox, baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.toolbox') });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, utterancesOnCurrentMedia, layers, translations, setSaveState]);

  const handleExportJyt = useCallback(async () => {
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'jieyu-project';
    await downloadJieyuArchive('jyt', baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.jyt') });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, setSaveState]);

  const handleExportJym = useCallback(async () => {
    const baseName = selectedUtteranceMedia
      ? selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '')
      : 'jieyu-project';
    await downloadJieyuArchive('jym', baseName);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.importExport.exportDone.jym') });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, setSaveState]);

  const handleImportFile = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    const isJieyuArchive = name.endsWith('.jym') || name.endsWith('.jyt');
    const text = isJieyuArchive ? '' : await readFileAsText(file);

    try {
      if (isJieyuArchive) {
        const imported = await importJieyuArchiveFile(file, { strategy: 'replace-all' });
        const totals = Object.values(imported.importResult.collections).reduce(
          (acc, c) => ({
            written: acc.written + (c?.written ?? 0),
            skipped: acc.skipped + (c?.skipped ?? 0),
          }),
          { written: 0, skipped: 0 },
        );
        await loadSnapshot();
        setSaveState({
          kind: 'done',
          message: tf(locale, 'transcription.importExport.importDone.archive', {
            kind: imported.kind.toUpperCase(),
            written: totals.written,
            skipped: totals.skipped,
          }),
        });
        return;
      }

      let eafResult: EafImportResult | null = null;
      let tgResult: TextGridImportResult | null = null;
      let trsResult: ReturnType<typeof importFromTrs> | null = null;
      let flexResult: ReturnType<typeof importFromFlextext> | null = null;
      let toolboxResult: ReturnType<typeof importFromToolbox> | null = null;

      if (name.endsWith('.eaf')) {
        eafResult = importFromEaf(text);
      } else if (name.endsWith('.textgrid')) {
        tgResult = importFromTextGrid(text);
      } else if (name.endsWith('.trs')) {
        trsResult = importFromTrs(text);
      } else if (name.endsWith('.flextext')) {
        flexResult = importFromFlextext(text);
      } else if (name.endsWith('.toolbox') || name.endsWith('.txt')) {
        toolboxResult = importFromToolbox(text);
      } else {
        setSaveState({ kind: 'error', message: t(locale, 'transcription.importExport.unsupportedFormat') });
        return;
      }

      const parsedUtterances = eafResult?.utterances
        ?? tgResult?.utterances
        ?? trsResult?.utterances
        ?? flexResult?.utterances
        ?? toolboxResult?.utterances
        ?? [];

      const additionalTiers: Map<string, Array<{ startTime: number; endTime: number; text: string }>> =
        eafResult?.translationTiers
        ?? tgResult?.additionalTiers
        ?? toolboxResult?.additionalTiers
        ?? new Map();

      if (flexResult && flexResult.phraseGlosses.size > 0) {
        const phraseGlossValues = Array.from(flexResult.phraseGlosses.values());
        const glossSegments = flexResult.utterances
          .map((u, i) => ({ startTime: u.startTime, endTime: u.endTime, text: phraseGlossValues[i] ?? '' }))
          .filter((s) => s.text.trim() !== '');
        if (glossSegments.length > 0) additionalTiers.set('FLEx Gloss', glossSegments);
      }

      const textId = activeTextId ?? (await getActiveTextId());
      if (!textId) { setSaveState({ kind: 'error', message: t(locale, 'transcription.importExport.noProject') }); return; }
      const mediaId = selectedUtteranceMedia?.id;
      const db = await getDb();
      const now = new Date().toISOString();

      const insertedUtterances: Array<{ id: string; startTime: number; endTime: number }> = [];
      for (const u of parsedUtterances) {
        const id = newId('utt');
        const startTime = Number(u.startTime.toFixed(3));
        const endTime = Number(u.endTime.toFixed(3));
        const maybeTokens = 'tokens' in u ? (u as { tokens?: unknown }).tokens : undefined;
        const maybeSpeakerId = 'speakerId' in u ? (u as { speakerId?: unknown }).speakerId : undefined;
        await LinguisticService.saveUtterance({
          id,
          textId,
          ...(mediaId ? { mediaId } : {}),
          startTime,
          endTime,
          annotationStatus: 'raw',
          ...(typeof maybeSpeakerId === 'string' && maybeSpeakerId.length > 0 ? { speakerId: maybeSpeakerId } : {}),
          createdAt: now,
          updatedAt: now,
        });

        if (Array.isArray(maybeTokens) && maybeTokens.length > 0) {
          const tokenRows: import('../../db').UtteranceTokenDocType[] = [];
          const morphRows: import('../../db').UtteranceMorphemeDocType[] = [];

          maybeTokens.forEach((rawToken, tokenIndex) => {
            if (!rawToken || typeof rawToken !== 'object') return;
            const token = rawToken as {
              form?: Record<string, string>;
              gloss?: Record<string, string>;
              pos?: string;
              morphemes?: Array<{
                form?: Record<string, string>;
                gloss?: Record<string, string>;
                pos?: string;
              }>;
            };
            const tokenId = newId('tok');
            if (!token.form || typeof token.form !== 'object') return;

            tokenRows.push({
              id: tokenId,
              textId,
              utteranceId: id,
              form: token.form,
              ...(token.gloss ? { gloss: token.gloss } : {}),
              ...(token.pos ? { pos: token.pos } : {}),
              tokenIndex,
              createdAt: now,
              updatedAt: now,
            });

            const morphemes = Array.isArray(token.morphemes) ? token.morphemes : [];
            morphemes.forEach((morph, morphemeIndex) => {
              if (!morph?.form || typeof morph.form !== 'object') return;
              morphRows.push({
                id: newId('morph'),
                textId,
                utteranceId: id,
                tokenId,
                form: morph.form,
                ...(morph.gloss ? { gloss: morph.gloss } : {}),
                ...(morph.pos ? { pos: morph.pos } : {}),
                morphemeIndex,
                createdAt: now,
                updatedAt: now,
              });
            });
          });

          if (tokenRows.length > 0) {
            await LinguisticService.saveTokensBatch(tokenRows);
          }
          if (morphRows.length > 0) {
            await LinguisticService.saveMorphemesBatch(morphRows);
          }
        }
        insertedUtterances.push({ id, startTime, endTime });

        if (u.transcription.trim() && defaultTranscriptionLayerId) {
          await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage({
            id: newId('utr'),
            utteranceId: id,
            tierId: defaultTranscriptionLayerId,
            modality: 'text' as const,
            text: u.transcription,
            sourceType: 'human' as const,
            createdAt: now,
            updatedAt: now,
          }, { actorType: 'importer', method: 'import' }));
        }
      }

      let tierCount = 0;
      const existingTrcLayers = layers.filter((l) => l.layerType === 'transcription');

      if (additionalTiers.size > 0 && existingTrcLayers.length === 0) {
        console.warn('[Import] 跳过翻译层导入：无转写层存在');
      }

      for (const [tierName, annotations] of additionalTiers) {
        if (annotations.length === 0) continue;
        if (existingTrcLayers.length === 0) continue;
        tierCount++;

        const layerId = newId('layer');
        const suffix = Math.random().toString(36).slice(2, 7);
        const key = `trl_import_${suffix}`;
        const newLayer = {
          id: layerId,
          textId,
          key,
          name: { eng: tierName, zho: tierName },
          layerType: 'translation' as const,
          languageId: 'und',
          modality: 'text' as const,
          acceptsAudio: false,
          sortOrder: tierCount + 1,
          createdAt: now,
          updatedAt: now,
        };
        await LayerTierUnifiedService.createLayer(newLayer as import('../../db').TranslationLayerDocType);

        for (const trc of existingTrcLayers) {
          await db.collections.layer_links.insert({
            id: newId('link'),
            transcriptionLayerKey: trc.key,
            tierId: layerId,
            linkType: 'free',
            isPreferred: false,
            createdAt: now,
          });
        }

        for (const ann of annotations) {
          const annStart = Number(ann.startTime.toFixed(3));
          const annEnd = Number(ann.endTime.toFixed(3));
          const match = insertedUtterances.find(
            (u) => Math.abs(u.startTime - annStart) < 0.01 && Math.abs(u.endTime - annEnd) < 0.01,
          );
          if (match && ann.text.trim()) {
            await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage({
              id: newId('utr'),
              utteranceId: match.id,
              tierId: layerId,
              modality: 'text' as const,
              text: ann.text,
              sourceType: 'human' as const,
              createdAt: now,
              updatedAt: now,
            }, { actorType: 'importer', method: 'import' }));
          }
        }
      }

      fireAndForget(
        validateLayerTierConsistency(textId).then((issues) => {
          if (issues.length > 0) {
            console.warn('[TierBridge] Post-import consistency issues:', issues);
          }
        }),
      );

      await loadSnapshot();
      setSaveState({
        kind: 'done',
        message: tierCount > 0
          ? tf(locale, 'transcription.importExport.importDone.segmentsWithLayers', {
            count: parsedUtterances.length,
            layers: tierCount,
          })
          : tf(locale, 'transcription.importExport.importDone.segments', {
            count: parsedUtterances.length,
          }),
      });
    } catch (err) {
      setSaveState({
        kind: 'error',
        message: tf(locale, 'transcription.importExport.failed', {
          message: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  }, [activeTextId, getActiveTextId, selectedUtteranceMedia, loadSnapshot, locale, setSaveState, defaultTranscriptionLayerId, layers]);

  return {
    importFileRef,
    exportMenuRef,
    showExportMenu,
    setShowExportMenu,
    handleExportEaf,
    handleExportTextGrid,
    handleExportTrs,
    handleExportFlextext,
    handleExportToolbox,
    handleExportJyt,
    handleExportJym,
    handleImportFile,
  };
}
