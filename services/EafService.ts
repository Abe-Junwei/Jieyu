/**
 * EAF (ELAN Annotation Format) import/export service.
 *
 * EAF is the XML format used by ELAN (https://archive.mpi.nl/tla/elan).
 * This service converts between Jieyu's data model and EAF 3.0.
 */

import type { UtteranceDocType, AnchorDocType, TranslationLayerDocType, UtteranceTextDocType, MediaItemDocType, UserNoteDocType } from '../db';

// ── Types ───────────────────────────────────────────────────

export interface EafExportInput {
  mediaItem?: MediaItemDocType;
  utterances: UtteranceDocType[];
  anchors?: AnchorDocType[];
  layers: TranslationLayerDocType[];
  translations: UtteranceTextDocType[];
  userNotes?: UserNoteDocType[];
}

export interface EafImportResult {
  mediaFilename: string;
  /** Utterances extracted from the default transcription tier */
  utterances: Array<{
    startTime: number;
    endTime: number;
    transcription: string;
  }>;
  /** Translation tiers keyed by tier name */
  translationTiers: Map<string, Array<{
    startTime: number;
    endTime: number;
    text: string;
  }>>;
}

// ── Export ───────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportToEaf(input: EafExportInput): string {
  const { mediaItem, utterances, anchors, layers, translations, userNotes } = input;
  const sorted = [...utterances].sort((a, b) => a.startTime - b.startTime);

  // Build time slots — use shared anchors when available
  let tsCounter = 1;
  const timeSlots: Array<{ id: string; ms: number }> = [];
  const uttSlotMap = new Map<string, { tsStart: string; tsEnd: string }>();

  if (anchors && anchors.length > 0) {
    // Standoff mode: map anchor IDs to TIME_SLOT IDs (shared anchors → shared TIME_SLOTs)
    const anchorToTsId = new Map<string, string>();
    const anchorById = new Map(anchors.map((a) => [a.id, a]));

    const getOrCreateTsForAnchor = (anchorId: string, fallbackMs: number): string => {
      const existing = anchorToTsId.get(anchorId);
      if (existing) return existing;
      const tsId = `ts${tsCounter++}`;
      const anchor = anchorById.get(anchorId);
      timeSlots.push({ id: tsId, ms: anchor ? Math.round(anchor.time * 1000) : Math.round(fallbackMs * 1000) });
      anchorToTsId.set(anchorId, tsId);
      return tsId;
    };

    for (const utt of sorted) {
      const tsStart = utt.startAnchorId
        ? getOrCreateTsForAnchor(utt.startAnchorId, utt.startTime)
        : `ts${tsCounter++}`;
      const tsEnd = utt.endAnchorId
        ? getOrCreateTsForAnchor(utt.endAnchorId, utt.endTime)
        : `ts${tsCounter++}`;

      // Add fallback time slots for utterances without anchors
      if (!utt.startAnchorId) timeSlots.push({ id: tsStart, ms: Math.round(utt.startTime * 1000) });
      if (!utt.endAnchorId) timeSlots.push({ id: tsEnd, ms: Math.round(utt.endTime * 1000) });

      uttSlotMap.set(utt.id, { tsStart, tsEnd });
    }
  } else {
    // Legacy mode: each utterance gets its own pair of time slots
    for (const utt of sorted) {
      const tsStart = `ts${tsCounter++}`;
      const tsEnd = `ts${tsCounter++}`;
      timeSlots.push({ id: tsStart, ms: Math.round(utt.startTime * 1000) });
      timeSlots.push({ id: tsEnd, ms: Math.round(utt.endTime * 1000) });
      uttSlotMap.set(utt.id, { tsStart, tsEnd });
    }
  }

  // Build annotation ID counter
  let annCounter = 1;

  // Determine default transcription layer
  const transcriptionLayers = layers.filter((l) => l.layerType === 'transcription');
  const defaultTrcId = transcriptionLayers.find((l) => l.isDefault)?.id ?? transcriptionLayers[0]?.id;

  // Transcription tier (default)
  const transcriptionAnnotations = sorted.map((utt) => {
    const slots = uttSlotMap.get(utt.id)!;
    const tr = defaultTrcId
      ? translations.find((t) => t.utteranceId === utt.id && t.tierId === defaultTrcId && t.modality === 'text')
      : undefined;
    const text = tr?.text ?? utt.transcription?.default ?? '';
    return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${annCounter++}" TIME_SLOT_REF1="${slots.tsStart}" TIME_SLOT_REF2="${slots.tsEnd}">
                <ANNOTATION_VALUE>${escapeXml(text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
  });

  // Additional tiers: non-default transcription layers + translation layers
  const additionalLayers = layers.filter(
    (l) => l.layerType === 'translation' || (l.layerType === 'transcription' && l.id !== defaultTrcId),
  );
  const translationTierXml: string[] = [];

  for (const layer of additionalLayers) {
    const layerTranslations = translations.filter((t) => t.tierId === layer.id && t.modality === 'text');
    const tierName = layer.name?.eng ?? layer.name?.zho ?? layer.key;

    const annotations = sorted
      .map((utt) => {
        const tr = layerTranslations.find((t) => t.utteranceId === utt.id);
        if (!tr?.text) return null;
        const slots = uttSlotMap.get(utt.id)!;
        return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${annCounter++}" TIME_SLOT_REF1="${slots.tsStart}" TIME_SLOT_REF2="${slots.tsEnd}">
                <ANNOTATION_VALUE>${escapeXml(tr.text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
      })
      .filter(Boolean);

    if (annotations.length > 0) {
      translationTierXml.push(`    <TIER TIER_ID="${escapeXml(tierName)}" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="${layer.languageId ?? 'en'}">
${annotations.join('\n')}
    </TIER>`);
    }
  }

  const mediaHeader = mediaItem
    ? `    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
        <MEDIA_DESCRIPTOR MEDIA_URL="${escapeXml(mediaItem.url ?? mediaItem.filename)}" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./${escapeXml(mediaItem.filename)}" />
    </HEADER>`
    : '    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds" />';

  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${new Date().toISOString()}" FORMAT="3.0" VERSION="3.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.mpi.nl/tools/elan/EAFv3.0.xsd">
${mediaHeader}
    <TIME_ORDER>
${timeSlots.map((ts) => `        <TIME_SLOT TIME_SLOT_ID="${ts.id}" TIME_VALUE="${ts.ms}" />`).join('\n')}
    </TIME_ORDER>
    <TIER TIER_ID="default" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="en">
${transcriptionAnnotations.join('\n')}
    </TIER>
${translationTierXml.join('\n')}
${buildNoteTierXml(sorted, uttSlotMap, userNotes ?? [], annCounter)}
    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>
`;
}

function buildNoteTierXml(
  sorted: UtteranceDocType[],
  uttSlotMap: Map<string, { tsStart: string; tsEnd: string }>,
  notes: UserNoteDocType[],
  annCounterStart: number,
): string {
  if (notes.length === 0) return '';

  // Group notes by utterance
  const notesByUtt = new Map<string, UserNoteDocType[]>();
  for (const note of notes) {
    if (note.targetType !== 'utterance') continue;
    const arr = notesByUtt.get(note.targetId);
    if (arr) arr.push(note);
    else notesByUtt.set(note.targetId, [note]);
  }

  let counter = annCounterStart;
  const annotations = sorted
    .map((utt) => {
      const uttNotes = notesByUtt.get(utt.id);
      if (!uttNotes || uttNotes.length === 0) return null;
      const slots = uttSlotMap.get(utt.id);
      if (!slots) return null;
      const text = uttNotes.map((n) => {
        const prefix = n.category ? `[${n.category}] ` : '';
        return prefix + (n.content['default'] ?? Object.values(n.content)[0] ?? '');
      }).join(' | ');
      return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${counter++}" TIME_SLOT_REF1="${slots.tsStart}" TIME_SLOT_REF2="${slots.tsEnd}">
                <ANNOTATION_VALUE>${escapeXml(text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
    })
    .filter(Boolean);

  if (annotations.length === 0) return '';

  return `    <TIER TIER_ID="notes" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="en">
${annotations.join('\n')}
    </TIER>`;
}

// ── Import ──────────────────────────────────────────────────

export function importFromEaf(xmlString: string): EafImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`EAF XML 解析失败: ${parseError.textContent}`);
  }

  // Extract media filename
  const mediaDesc = doc.querySelector('MEDIA_DESCRIPTOR');
  const relUrl = mediaDesc?.getAttribute('RELATIVE_MEDIA_URL') ?? '';
  const mediaUrl = mediaDesc?.getAttribute('MEDIA_URL') ?? '';
  const mediaFilename = relUrl.replace(/^\.\//, '') || mediaUrl.split('/').pop() || 'unknown.wav';

  // Parse time slots
  const timeSlotMap = new Map<string, number>();
  doc.querySelectorAll('TIME_SLOT').forEach((el) => {
    const id = el.getAttribute('TIME_SLOT_ID');
    const val = el.getAttribute('TIME_VALUE');
    if (id && val) timeSlotMap.set(id, parseInt(val, 10));
  });

  // Parse tiers
  const tiers = doc.querySelectorAll('TIER');
  let utterances: EafImportResult['utterances'] = [];
  const translationTiers = new Map<string, EafImportResult['translationTiers'] extends Map<string, infer V> ? V : never>();

  tiers.forEach((tier, tierIndex) => {
    const tierId = tier.getAttribute('TIER_ID') ?? `tier_${tierIndex}`;
    const annotations: Array<{ startTime: number; endTime: number; text: string }> = [];

    tier.querySelectorAll('ALIGNABLE_ANNOTATION').forEach((ann) => {
      const ts1 = ann.getAttribute('TIME_SLOT_REF1');
      const ts2 = ann.getAttribute('TIME_SLOT_REF2');
      const value = ann.querySelector('ANNOTATION_VALUE')?.textContent ?? '';
      if (ts1 && ts2) {
        const startMs = timeSlotMap.get(ts1);
        const endMs = timeSlotMap.get(ts2);
        if (startMs != null && endMs != null) {
          annotations.push({
            startTime: startMs / 1000,
            endTime: endMs / 1000,
            text: value,
          });
        }
      }
    });

    if (tierIndex === 0) {
      // First tier = transcription
      utterances = annotations.map((a) => ({
        startTime: a.startTime,
        endTime: a.endTime,
        transcription: a.text,
      }));
    } else {
      translationTiers.set(tierId, annotations);
    }
  });

  return { mediaFilename, utterances, translationTiers };
}

// ── File helpers ────────────────────────────────────────────

export function downloadEaf(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.eaf') ? filename : `${filename}.eaf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file: File, encoding = 'utf-8'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`文件读取失败: ${reader.error?.message ?? 'unknown'}`));
    reader.readAsText(file, encoding);
  });
}
