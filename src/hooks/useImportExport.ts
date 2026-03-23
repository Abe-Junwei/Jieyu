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
import { humanizeTierName } from '../utils/transcriptionFormatters';
import { parseBcp47 } from '../utils/transcriptionFormatters';

/** 将 EAF 元数据编码进层 key，便于导出时保留外部标识 | Encode EAF metadata in layer key for export-time external fidelity */
function withEafKeyMeta(baseKey: string, meta?: { tierId?: string; langLabel?: string }): string {
  if (!meta) return baseKey;
  const tierId = meta.tierId?.trim();
  const langLabel = meta.langLabel?.trim();
  if (!tierId && !langLabel) return baseKey;
  const payload = JSON.stringify({
    ...(tierId ? { tierId } : {}),
    ...(langLabel ? { langLabel } : {}),
  });
  return `${baseKey}__eafmeta_${encodeURIComponent(payload)}`;
}

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
      let mediaId = selectedUtteranceMedia?.id;

      // ── 为 EAF 导入创建 MediaItem（如果 EAF 包含媒体引用且当前未选择媒体）─────
      if (!mediaId && eafResult && eafResult.mediaFilename && eafResult.mediaFilename !== 'unknown.wav') {
        const { mediaId: newMediaId } = await LinguisticService.importAudio({
          textId,
          audioBlob: new Blob([], { type: 'audio/wav' }),
          filename: eafResult.mediaFilename,
          duration: 0,
        });
        mediaId = newMediaId;
      }

      const db = await getDb();
      const now = new Date().toISOString();

      // ── 语言名反查：ISO 主码 -> 语言名（来自本地 DB）| Resolve language labels from local DB by ISO primary code ──
      const languageDocs = await db.collections.languages.find().exec();
      const languageNameByIso = new Map<string, string>();
      for (const doc of languageDocs) {
        const language = doc.toJSON();
        const fromName = typeof language.name === 'object' && language.name !== null
          ? ((language.name.zho ?? language.name.eng ?? Object.values(language.name).find((v) => typeof v === 'string' && v.trim().length > 0)) ?? '')
          : '';
        const displayName = (fromName || language.autonym || '').trim();
        if (!displayName) continue;
        languageNameByIso.set(language.id.toLocaleLowerCase('en'), displayName);
      }

      // 从语言标签提取主码并查 DB | Extract primary code from language tag and resolve via DB
      function resolveDbLanguageName(languageTagOrId?: string): string | undefined {
        if (!languageTagOrId) return undefined;
        const raw = languageTagOrId.trim();
        if (!raw) return undefined;
        const primary = parseBcp47(raw).primary;
        return languageNameByIso.get(raw.toLocaleLowerCase('en'))
          ?? (primary ? languageNameByIso.get(primary.toLocaleLowerCase('en')) : undefined);
      }

      // 从 EAF <LANGUAGE> 中取标签，支持完整 tag 和 primary code | Resolve label from EAF <LANGUAGE> by full tag or primary code
      function resolveEafLanguageLabel(languageTagOrId?: string): string | undefined {
        if (!eafResult || !languageTagOrId) return undefined;
        const raw = languageTagOrId.trim();
        if (!raw) return undefined;
        const primary = parseBcp47(raw).primary;
        return eafResult.languageLabels.get(raw)
          ?? (primary ? eafResult.languageLabels.get(primary) : undefined);
      }

      type LayerNameSource = 'db' | 'eaf' | 'fallback';

      // 按优先级解析层显示名并返回来源 | Resolve layer display name with source info
      function resolveLayerDisplayName(
        languageTagCandidates: Array<string | undefined>,
        fallbackName: string,
      ): { label: string; source: LayerNameSource; matchedTag?: string } {
        for (const candidate of languageTagCandidates) {
          const fromDb = resolveDbLanguageName(candidate);
          if (fromDb) {
            return { label: fromDb, source: 'db', ...(candidate ? { matchedTag: candidate } : {}) };
          }
        }
        for (const candidate of languageTagCandidates) {
          const fromEaf = resolveEafLanguageLabel(candidate);
          if (fromEaf) {
            return { label: fromEaf, source: 'eaf', ...(candidate ? { matchedTag: candidate } : {}) };
          }
        }
        return { label: fallbackName, source: 'fallback' };
      }

      // 导入命名来源审计 | Audit language-name source chosen during import
      async function writeImportLayerNameAudit(inputData: {
        layerId: string;
        displayName: string;
        source: LayerNameSource;
        languageId?: string;
        tierName?: string;
        matchedTag?: string;
      }): Promise<void> {
        try {
          await db.collections.audit_logs.insert({
            id: newId('audit'),
            collection: 'tier_definitions',
            documentId: inputData.layerId,
            action: 'create',
            field: 'name',
            ...(inputData.displayName ? { newValue: inputData.displayName } : {}),
            source: 'system',
            timestamp: now,
            metadataJson: JSON.stringify({
              mode: 'import-language-name-resolution',
              nameSource: inputData.source,
              ...(inputData.languageId ? { languageId: inputData.languageId } : {}),
              ...(inputData.tierName ? { tierName: inputData.tierName } : {}),
              ...(inputData.matchedTag ? { matchedTag: inputData.matchedTag } : {}),
            }),
          });
        } catch (auditErr) {
          console.warn('[Import] 语言名来源审计写入失败 | Failed to write language-name audit log', auditErr);
        }
      }

      // ── 创建说话人记录并建立 ID 映射（按名称去重）| Create speaker records with name-based dedup ──
      const speakerIdMap = new Map<string, string>(); // 原始标识 → DB speaker.id
      const existingSpeakers = await LinguisticService.getSpeakers();
      const speakerByName = new Map(
        existingSpeakers.map((s) => [s.name.toLocaleLowerCase('zh-Hans-CN'), s] as const),
      );

      async function resolveOrCreateSpeaker(rawKey: string, displayName: string): Promise<string> {
        const normalized = displayName.trim().toLocaleLowerCase('zh-Hans-CN');
        const existing = speakerByName.get(normalized);
        if (existing) {
          speakerIdMap.set(rawKey, existing.id);
          return existing.id;
        }
        const speaker = await LinguisticService.createSpeaker({ name: displayName.trim() });
        speakerByName.set(normalized, speaker);
        speakerIdMap.set(rawKey, speaker.id);
        return speaker.id;
      }

      if (eafResult && eafResult.participants.length > 0) {
        for (const name of eafResult.participants) {
          await resolveOrCreateSpeaker(name, name);
        }
      } else if (trsResult && trsResult.speakers.length > 0) {
        for (const trsSpeaker of trsResult.speakers) {
          await resolveOrCreateSpeaker(trsSpeaker.id, trsSpeaker.name);
        }
      }

      // ── 转写层：按名称去重，名称匹配则复用，否则新建 | Transcription layer: dedup by name ──
      let effectiveTranscriptionLayerId = defaultTranscriptionLayerId;
      let autoCreatedLayerKey: string | undefined;

      // 推断导入文件的转写层名称 | Infer transcription tier name from parsed result
      const importedTrcName = eafResult?.transcriptionTierName
        ?? tgResult?.transcriptionTierName
        ?? undefined; // TRS / FLEx / Toolbox 无显式层名
      const inferredTranscriptionLang = eafResult?.defaultLocale
        ?? flexResult?.sourceLanguage
        ?? trsResult?.speakers?.[0]?.lang
        ?? 'und';

      if (parsedUtterances.some((u) => u.transcription.trim())) {
        // 按名称在已有转写层中查找 | Search existing transcription layers by name
        const existingTrc = layers.filter((l) => l.layerType === 'transcription');
        {
          const dedupCandidates = new Set<string>();
          if (importedTrcName) {
            dedupCandidates.add(importedTrcName.toLocaleLowerCase('en'));
            dedupCandidates.add(humanizeTierName(importedTrcName).toLocaleLowerCase('en'));
            const dbResolvedByTierName = resolveDbLanguageName(importedTrcName);
            if (dbResolvedByTierName) dedupCandidates.add(dbResolvedByTierName.toLocaleLowerCase('en'));
          }
          const dbResolvedByLang = resolveDbLanguageName(inferredTranscriptionLang);
          if (dbResolvedByLang) dedupCandidates.add(dbResolvedByLang.toLocaleLowerCase('en'));

          const nameMatch = existingTrc.find((l) => {
            const eng = typeof l.name === 'object' && l.name !== null ? (l.name as Record<string, string>).eng ?? '' : '';
            const engLower = eng.toLocaleLowerCase('en');
            return dedupCandidates.has(engLower);
          });
          if (nameMatch) {
            effectiveTranscriptionLayerId = nameMatch.id;
          }
        }

        // 若无名称匹配且无默认层 → 新建 | No name match and no default → create new
        if (!effectiveTranscriptionLayerId) {
          const trcDisplayName = resolveLayerDisplayName(
            [inferredTranscriptionLang, importedTrcName],
            humanizeTierName(importedTrcName ?? 'Transcription'),
          );
          const displayName = trcDisplayName.label;
          const autoLayerId = newId('layer');
          const baseTrcKey = `trc_import_${Math.random().toString(36).slice(2, 7)}`;
          const eafTrcLangLabel = resolveEafLanguageLabel(inferredTranscriptionLang)
            ?? resolveEafLanguageLabel(importedTrcName);
          autoCreatedLayerKey = eafResult
            ? withEafKeyMeta(baseTrcKey, {
              ...(importedTrcName ? { tierId: importedTrcName } : {}),
              ...(eafTrcLangLabel ? { langLabel: eafTrcLangLabel } : {}),
            })
            : baseTrcKey;
          await LayerTierUnifiedService.createLayer({
            id: autoLayerId,
            textId,
            key: autoCreatedLayerKey,
            name: { eng: displayName, zho: displayName },
            layerType: 'transcription' as const,
            languageId: inferredTranscriptionLang,
            modality: 'text' as const,
            acceptsAudio: false,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          } as import('../../db').TranslationLayerDocType);
          await writeImportLayerNameAudit({
            layerId: autoLayerId,
            displayName,
            source: trcDisplayName.source,
            languageId: inferredTranscriptionLang,
            ...(importedTrcName ? { tierName: importedTrcName } : {}),
            ...(trcDisplayName.matchedTag ? { matchedTag: trcDisplayName.matchedTag } : {}),
          });
          effectiveTranscriptionLayerId = autoLayerId;
        }
      }

      const insertedUtterances: Array<{ id: string; startTime: number; endTime: number }> = [];
      for (const u of parsedUtterances) {
        const id = newId('utt');
        const startTime = Number(u.startTime.toFixed(3));
        const endTime = Number(u.endTime.toFixed(3));
        const maybeTokens = 'tokens' in u ? (u as { tokens?: unknown }).tokens : undefined;
        const maybeSpeakerId = 'speakerId' in u ? (u as { speakerId?: unknown }).speakerId : undefined;
        const maybeAnnotationId = ('annotationId' in u && typeof (u as { annotationId?: string }).annotationId === 'string')
        ? (u as { annotationId: string }).annotationId
        : undefined;
        // 将原始说话人标识映射为 DB ID | Resolve raw speaker label to DB speaker ID
        const resolvedSpeakerId = typeof maybeSpeakerId === 'string' && maybeSpeakerId.length > 0
          ? speakerIdMap.get(maybeSpeakerId) ?? maybeSpeakerId
          : undefined;
        await LinguisticService.saveUtterance({
          id,
          textId,
          ...(mediaId ? { mediaId } : {}),
          startTime,
          endTime,
          annotationStatus: 'raw',
          ...(resolvedSpeakerId ? { speakerId: resolvedSpeakerId } : {}),
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

        if (u.transcription.trim() && effectiveTranscriptionLayerId) {
          await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage({
            id: newId('utr'),
            utteranceId: id,
            tierId: effectiveTranscriptionLayerId,
            modality: 'text' as const,
            text: u.transcription,
            sourceType: 'human' as const,
            ...(maybeAnnotationId ? { externalRef: maybeAnnotationId } : {}),
            createdAt: now,
            updatedAt: now,
          }, { actorType: 'importer', method: 'import' }));
        }
      }

      let tierCount = 0;
      // 包含自动创建的转写层 | Include auto-created transcription layer
      const existingTrcLayers = [
        ...layers.filter((l) => l.layerType === 'transcription'),
        ...(autoCreatedLayerKey && effectiveTranscriptionLayerId
          ? [{ key: autoCreatedLayerKey, id: effectiveTranscriptionLayerId }]
          : []),
      ];

      if (additionalTiers.size > 0 && existingTrcLayers.length === 0) {
        console.warn('[Import] 跳过翻译层导入：无转写层存在');
      }

      // 已有翻译层索引（按 eng name 去重） | Index existing translation layers by eng name
      const existingTrlByName = new Map(
        layers
          .filter((l) => l.layerType === 'translation')
          .map((l) => {
            const engName = typeof l.name === 'object' && l.name !== null ? (l.name as Record<string, string>).eng ?? '' : '';
            return [engName.toLocaleLowerCase('en'), l] as const;
          })
          .filter(([k]) => k.length > 0),
      );

      for (const [tierName, annotations] of additionalTiers) {
        if (annotations.length === 0) continue;
        if (existingTrcLayers.length === 0) continue;

        // 从解析结果推断翻译语言 | Infer translation language from parsed result
        const tierLang = eafResult?.tierLocales?.get(tierName)
          ?? flexResult?.glossLanguage
          ?? 'und';

        // 去重：按名称匹配已有翻译层 | Dedup: reuse existing layer by name match
        const humanizedName = humanizeTierName(tierName);
        const dbResolvedName = resolveDbLanguageName(tierName)
          ?? resolveDbLanguageName(tierLang);
        const existingMatch = existingTrlByName.get(tierName.toLocaleLowerCase('en'))
          ?? existingTrlByName.get(humanizedName.toLocaleLowerCase('en'))
          ?? (dbResolvedName ? existingTrlByName.get(dbResolvedName.toLocaleLowerCase('en')) : undefined);
        let layerId: string;
        if (existingMatch) {
          layerId = existingMatch.id;
        } else {
          tierCount++;
          layerId = newId('layer');
          const suffix = Math.random().toString(36).slice(2, 7);
          const baseKey = `trl_import_${suffix}`;
          const humanizedTierName = humanizeTierName(tierName);
          const trlDisplayName = resolveLayerDisplayName([tierLang, tierName], humanizedTierName);
          const langLabel = trlDisplayName.label;
          const eafTrlLangLabel = resolveEafLanguageLabel(tierLang)
            ?? resolveEafLanguageLabel(tierName);
          const key = eafResult
            ? withEafKeyMeta(baseKey, {
              tierId: tierName,
              ...(eafTrlLangLabel ? { langLabel: eafTrlLangLabel } : {}),
            })
            : baseKey;
          const newLayer = {
            id: layerId,
            textId,
            key,
            name: { eng: langLabel, zho: langLabel },
            layerType: 'translation' as const,
            languageId: tierLang,
            modality: 'text' as const,
            acceptsAudio: false,
            sortOrder: tierCount + 1,
            createdAt: now,
            updatedAt: now,
          };
          await LayerTierUnifiedService.createLayer(newLayer as import('../../db').TranslationLayerDocType);
          await writeImportLayerNameAudit({
            layerId,
            displayName: langLabel,
            source: trlDisplayName.source,
            languageId: tierLang,
            tierName,
            ...(trlDisplayName.matchedTag ? { matchedTag: trlDisplayName.matchedTag } : {}),
          });

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
        }

        for (const ann of annotations) {
          const annStart = Number(ann.startTime.toFixed(3));
          const annEnd = Number(ann.endTime.toFixed(3));
          const match = insertedUtterances.find(
            (u) => Math.abs(u.startTime - annStart) < 0.05 && Math.abs(u.endTime - annEnd) < 0.05,
          );
          if (match && ann.text.trim()) {
            await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage({
              id: newId('utr'),
              utteranceId: match.id,
              tierId: layerId,
              modality: 'text' as const,
              text: ann.text,
              sourceType: 'human' as const,
              ...('annotationId' in ann && typeof ann.annotationId === 'string' ? { externalRef: ann.annotationId } : {}),
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
