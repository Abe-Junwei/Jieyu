/**
 * Transcriber (.trs) import/export service.
 *
 * Transcriber is a tool for transcribing speech recordings.
 * The .trs format is an XML dialect with the following structure:
 *
 *   <Trans>
 *     <Speakers>
 *       <Speaker id="spk1" name="Speaker 1" />
 *     </Speakers>
 *     <Episode>
 *       <Section type="report" startTime="0" endTime="10.5">
 *         <Turn speaker="spk1" startTime="0" endTime="5.2">
 *           <Sync time="0"/>
 *           text of first segment
 *           <Sync time="2.5"/>
 *           text of second segment
 *         </Turn>
 *       </Section>
 *     </Episode>
 *   </Trans>
 *
 * Mapping to Jieyu:
 *   Turn / Sync-delimited segment  →  unit (startTime / endTime / transcription)
 *   Speaker[@id]                    →  speaker id (linked via speakerId)
 *   Speaker[@name]                  →  speaker name
 */

import type {
  LayerDocType,
  LayerUnitContentDocType,
  OrthographyDocType,
  LayerUnitDocType,
} from '../db';
import type { OrthographyInteropMetadata } from '../utils/orthographyInteropMetadata';
import { resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import {
  stripPlainTextBidiIsolation,
  wrapPlainTextWithBidiIsolation,
} from '../utils/bidiPlainText';

type TimelineInteropMetadata = Pick<
  OrthographyInteropMetadata,
  'timelineMode' | 'logicalDurationSec' | 'timebaseLabel'
>;

// ── Types ───────────────────────────────────────────────────

export interface TrsSpeaker {
  id: string;
  name: string;
  /** BCP 47 language tag if present in @xml:lang or custom attribute */
  lang?: string;
  check?: string;
  dialect?: string;
  accent?: string;
  scope?: string;
}

export interface TrsExportInput {
  units: LayerUnitDocType[];
  speakers?: TrsSpeaker[];
  orthographies?: OrthographyDocType[];
  transcriptionLayer?: LayerDocType;
  /**
   * Canonical default-layer text from layer_unit_contents.
   * Preferred over legacy `unit.transcription.default` when present.
   */
  translations?: LayerUnitContentDocType[];
  /** Programme title written into <Trans program="..."> */
  programTitle?: string;
  /** 逻辑时间元数据（文献项目导出声明）| Logical timeline metadata for document-mode export */
  timelineMetadata?: TimelineInteropMetadata;
}

export interface TrsImportResult {
  /** Speaker records extracted from <Speakers> */
  speakers: TrsSpeaker[];
  /** 项目级逻辑时间元数据 | Project-level logical timeline metadata */
  timelineMetadata?: TimelineInteropMetadata;
  /** Unit segments extracted from <Turn>/<Sync> structure */
  units: Array<{
    startTime: number;
    endTime: number;
    transcription: string;
    /** Speaker[@id] value of the enclosing <Turn> element */
    speakerId?: string;
    /** Section topic if present */
    topic?: string;
  }>;
  /** Section-level topics (aggregated; preferred over per-unit topic for persistence) */
  sectionTopics?: Array<{ startTime: number; endTime: number; topic: string }>;
}

// ── Helpers ─────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatTime(seconds: number): string {
  // Transcriber uses decimal seconds, e.g. "3.456"
  return seconds.toFixed(3);
}

function buildTimelineAttributeFragment(timelineMetadata?: TimelineInteropMetadata): string {
  if (!timelineMetadata) return '';
  const attrs = [
    timelineMetadata.timelineMode
      ? ` jieyu_timeline_mode="${escapeXml(timelineMetadata.timelineMode)}"`
      : '',
    timelineMetadata.logicalDurationSec !== undefined
      ? ` jieyu_logical_duration_sec="${escapeXml(String(timelineMetadata.logicalDurationSec))}"`
      : '',
    timelineMetadata.timebaseLabel
      ? ` jieyu_timebase_label="${escapeXml(timelineMetadata.timebaseLabel)}"`
      : '',
  ].join('');
  return attrs;
}

function readTimelineMetadataFromAttributes(
  element: Element | null,
): TimelineInteropMetadata | undefined {
  if (!element) return undefined;
  const timelineModeAttr = element.getAttribute('jieyu_timeline_mode');
  const timelineMode =
    timelineModeAttr === 'document' || timelineModeAttr === 'media' ? timelineModeAttr : undefined;
  const logicalDurationRaw = element.getAttribute('jieyu_logical_duration_sec');
  const logicalDurationSec =
    logicalDurationRaw !== null && Number.isFinite(Number(logicalDurationRaw))
      ? Number(logicalDurationRaw)
      : undefined;
  const timebaseLabel = element.getAttribute('jieyu_timebase_label')?.trim() || undefined;
  if (!timelineMode && logicalDurationSec === undefined && !timebaseLabel) return undefined;
  return {
    ...(timelineMode ? { timelineMode } : {}),
    ...(logicalDurationSec !== undefined ? { logicalDurationSec } : {}),
    ...(timebaseLabel ? { timebaseLabel } : {}),
  };
}

// ── Export ───────────────────────────────────────────────────

export function exportToTrs(input: TrsExportInput): string {
  const {
    units,
    speakers = [],
    orthographies,
    transcriptionLayer,
    translations,
    programTitle = 'Jieyu Export',
    timelineMetadata,
  } = input;
  const sorted = [...units].sort((a, b) => a.startTime - b.startTime);
  const transcriptionRenderPolicy = transcriptionLayer?.languageId
    ? resolveOrthographyRenderPolicy(
        transcriptionLayer.languageId,
        orthographies,
        transcriptionLayer.orthographyId,
      )
    : undefined;
  const canonicalTextByUnitId = new Map<string, string>();
  if (transcriptionLayer?.id && translations) {
    for (const row of translations) {
      if (
        row.layerId === transcriptionLayer.id &&
        row.modality === 'text' &&
        typeof row.unitId === 'string' &&
        row.unitId.length > 0 &&
        typeof row.text === 'string' &&
        row.text.trim().length > 0
      ) {
        canonicalTextByUnitId.set(row.unitId, row.text);
      }
    }
  }

  // Collect distinct speaker IDs referenced by units
  const speakerIds = new Set(sorted.map((u) => u.speakerId).filter(Boolean) as string[]);

  // Build speaker elements — use provided metadata if available, otherwise generate stubs
  const speakerMap = new Map(speakers.map((s) => [s.id, s]));
  for (const id of speakerIds) {
    if (!speakerMap.has(id)) speakerMap.set(id, { id, name: id });
  }

  const speakersXml = [...speakerMap.values()]
    .map(
      (s) =>
        `    <Speaker id="${escapeXml(s.id)}" name="${escapeXml(s.name)}"${
          s.lang ? ` xml:lang="${escapeXml(s.lang)}"` : ''
        } check="${escapeXml(s.check ?? 'no')}" dialect="${escapeXml(s.dialect ?? 'native')}" accent="${escapeXml(s.accent ?? '')}" scope="${escapeXml(s.scope ?? 'local')}" />`,
    )
    .join('\n');

  // Group consecutive units that share the same speaker into <Turn> elements.
  // Multiple Sync-delimited segments within a Turn share the speaker attribution.
  interface TurnGroup {
    speakerId?: string;
    units: LayerUnitDocType[];
    startTime: number;
    endTime: number;
  }

  const turns: TurnGroup[] = [];
  for (const utt of sorted) {
    const last = turns[turns.length - 1];
    if (last && last.speakerId === utt.speakerId) {
      last.units.push(utt);
      last.endTime = utt.endTime;
    } else {
      turns.push({
        ...(utt.speakerId !== undefined && { speakerId: utt.speakerId }),
        units: [utt],
        startTime: utt.startTime,
        endTime: utt.endTime,
      });
    }
  }

  const globalEnd = sorted.length > 0 ? sorted[sorted.length - 1]!.endTime : 0;

  const turnsXml = turns
    .map((turn) => {
      const spkAttr = turn.speakerId ? ` speaker="${escapeXml(turn.speakerId)}"` : '';
      const segments = turn.units
        .map((u) => {
          const rawText = canonicalTextByUnitId.get(u.id) ?? u.transcription?.default ?? '';
          const text = wrapPlainTextWithBidiIsolation(rawText, transcriptionRenderPolicy);
          return `          <Sync time="${formatTime(u.startTime)}"/>\n          ${escapeXml(text)}`;
        })
        .join('\n');
      return `        <Turn${spkAttr} startTime="${formatTime(turn.startTime)}" endTime="${formatTime(turn.endTime)}">
${segments}
        </Turn>`;
    })
    .join('\n');

  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE Trans SYSTEM "trans-14.dtd">
<Trans program="${escapeXml(programTitle)}" air_date="${date}" scribe="" version="1" version_date="${date}"${buildTimelineAttributeFragment(timelineMetadata)}>
  <Speakers>
${speakersXml}
  </Speakers>
  <Episode>
    <Section type="report" startTime="${formatTime(0)}" endTime="${formatTime(globalEnd)}">
${turnsXml}
    </Section>
  </Episode>
</Trans>
`;
}

// ── Import ───────────────────────────────────────────────────

export function importFromTrs(xmlString: string): TrsImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`TRS XML 解析失败: ${parseError.textContent}`);
  }

  // Parse speakers
  const speakers: TrsSpeaker[] = [];
  doc.querySelectorAll('Speakers > Speaker').forEach((el) => {
    const id = el.getAttribute('id');
    const name = el.getAttribute('name');
    if (!id) return;
    const check = el.getAttribute('check')?.trim() || undefined;
    const dialect = el.getAttribute('dialect')?.trim() || undefined;
    const accent = el.getAttribute('accent')?.trim() || undefined;
    const scope = el.getAttribute('scope')?.trim() || undefined;
    speakers.push({
      id,
      name: name ?? id,
      ...(el.getAttribute('xml:lang') != null && { lang: el.getAttribute('xml:lang')! }),
      ...(check ? { check } : {}),
      ...(dialect ? { dialect } : {}),
      ...(accent ? { accent } : {}),
      ...(scope ? { scope } : {}),
    });
  });

  const units: TrsImportResult['units'] = [];
  const sectionTopics: NonNullable<TrsImportResult['sectionTopics']> = [];
  const sectionEls = Array.from(doc.querySelectorAll('Section'));
  sectionEls.forEach((section, sectionIndex) => {
    const topic = section.getAttribute('topic')?.trim();
    if (!topic) return;
    const startTime = parseFloat(section.getAttribute('startTime') ?? '0');
    const endAttr = section.getAttribute('endTime');
    let endTime = endAttr != null && endAttr.trim() !== '' ? parseFloat(endAttr) : Number.NaN;
    if (!Number.isFinite(endTime)) {
      const nextSection = sectionEls[sectionIndex + 1];
      const nextStart = nextSection
        ? parseFloat(nextSection.getAttribute('startTime') ?? '')
        : Number.NaN;
      if (Number.isFinite(nextStart)) {
        endTime = nextStart;
      } else {
        const turnEnds = Array.from(section.querySelectorAll('Turn')).map((turn) =>
          parseFloat(turn.getAttribute('endTime') ?? ''),
        );
        const maxTurnEnd = turnEnds.reduce(
          (max, value) => (Number.isFinite(value) && value > max ? value : max),
          Number.NEGATIVE_INFINITY,
        );
        endTime = Number.isFinite(maxTurnEnd) ? maxTurnEnd : startTime;
      }
    }
    sectionTopics.push({
      startTime: Number.isFinite(startTime) ? startTime : 0,
      endTime: Number.isFinite(endTime) ? endTime : Number.isFinite(startTime) ? startTime : 0,
      topic,
    });
  });
  const timelineMetadata = readTimelineMetadataFromAttributes(doc.documentElement);

  // Each <Turn> contains one or more <Sync> nodes with interleaved text nodes.
  // We reconstruct segments as the text between consecutive <Sync> elements.
  doc.querySelectorAll('Turn').forEach((turn) => {
    const speakerId = turn.getAttribute('speaker') ?? undefined;
    const turnEnd = parseFloat(turn.getAttribute('endTime') ?? '0');

    // Find enclosing <Section> for topic metadata
    const section = turn.closest('Section');
    const topic = section?.getAttribute('topic') ?? undefined;

    // Collect child nodes in order to reconstruct Sync-delimited segments
    const childNodes = Array.from(turn.childNodes);

    // Find indices of <Sync> elements
    const syncIndices: number[] = [];
    childNodes.forEach((node, i) => {
      if (node.nodeType === 1 /* ELEMENT_NODE */ && (node as Element).tagName === 'Sync') {
        syncIndices.push(i);
      }
    });

    if (syncIndices.length === 0) {
      // No Sync elements — treat entire Turn text as one segment
      const text = stripPlainTextBidiIsolation(collectText(childNodes).trim());
      if (text) {
        const startTime = parseFloat(turn.getAttribute('startTime') ?? '0');
        units.push({
          startTime,
          endTime: turnEnd,
          transcription: text,
          ...(speakerId !== undefined && { speakerId }),
          ...(topic !== undefined && { topic }),
        });
      }
      return;
    }

    // Process each Sync-delimited segment
    for (let i = 0; i < syncIndices.length; i++) {
      const syncIdx = syncIndices[i]!;
      const syncEl = childNodes[syncIdx] as Element;
      const startTime = parseFloat(syncEl.getAttribute('time') ?? '0');

      // End time = next Sync's time, or Turn's endTime for the last segment
      const nextSyncIdx = syncIndices[i + 1];
      const endTime =
        nextSyncIdx !== undefined
          ? parseFloat((childNodes[nextSyncIdx] as Element).getAttribute('time') ?? '0')
          : turnEnd;

      // Collect text nodes between this Sync and the next Sync (or end of Turn)
      const sliceEnd = nextSyncIdx ?? childNodes.length;
      const textNodes = childNodes.slice(syncIdx + 1, sliceEnd);
      const text = stripPlainTextBidiIsolation(collectText(textNodes).trim());

      // Skip zero-duration or empty segments
      if (endTime <= startTime || !text) continue;

      units.push({
        startTime,
        endTime,
        transcription: text,
        ...(speakerId !== undefined && { speakerId }),
        ...(topic !== undefined && { topic }),
      });
    }
  });

  // Sort by startTime for consistency
  units.sort((a, b) => a.startTime - b.startTime);

  return {
    speakers,
    ...(timelineMetadata ? { timelineMetadata } : {}),
    units,
    ...(sectionTopics.length > 0 ? { sectionTopics } : {}),
  };
}

/** Extract concatenated text content from an array of DOM nodes */
function collectText(nodes: ChildNode[]): string {
  return nodes
    .map((n) => {
      if (n.nodeType === 3 /* TEXT_NODE */) return n.textContent ?? '';
      // Inline annotation elements such as <Who> or <Comment> — skip their content
      return '';
    })
    .join('');
}

// ── File helpers ─────────────────────────────────────────────

export function downloadTrs(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.trs') ? filename : `${filename}.trs`;
  a.click();
  URL.revokeObjectURL(url);
}
