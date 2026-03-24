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
 *   Turn / Sync-delimited segment  →  utterance (startTime / endTime / transcription)
 *   Speaker[@id]                    →  speaker id (linked via speakerId)
 *   Speaker[@name]                  →  speaker name
 */

import type { UtteranceDocType } from '../../db';

// ── Types ───────────────────────────────────────────────────

export interface TrsSpeaker {
  id: string;
  name: string;
  /** BCP 47 language tag if present in @xml:lang or custom attribute */
  lang?: string;
}

export interface TrsExportInput {
  utterances: UtteranceDocType[];
  speakers?: TrsSpeaker[];
  /** Programme title written into <Trans program="..."> */
  programTitle?: string;
}

export interface TrsImportResult {
  /** Speaker records extracted from <Speakers> */
  speakers: TrsSpeaker[];
  /** Utterance segments extracted from <Turn>/<Sync> structure */
  utterances: Array<{
    startTime: number;
    endTime: number;
    transcription: string;
    /** Speaker[@id] value of the enclosing <Turn> element */
    speakerId?: string;
    /** Section topic if present */
    topic?: string;
  }>;
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

// ── Export ───────────────────────────────────────────────────

export function exportToTrs(input: TrsExportInput): string {
  const { utterances, speakers = [], programTitle = 'Jieyu Export' } = input;
  const sorted = [...utterances].sort((a, b) => a.startTime - b.startTime);

  // Collect distinct speaker IDs referenced by utterances
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
        } check="no" dialect="native" accent="" scope="local" />`,
    )
    .join('\n');

  // Group consecutive utterances that share the same speaker into <Turn> elements.
  // Multiple Sync-delimited segments within a Turn share the speaker attribution.
  interface TurnGroup {
    speakerId?: string;
    utterances: UtteranceDocType[];
    startTime: number;
    endTime: number;
  }

  const turns: TurnGroup[] = [];
  for (const utt of sorted) {
    const last = turns[turns.length - 1];
    if (last && last.speakerId === utt.speakerId) {
      last.utterances.push(utt);
      last.endTime = utt.endTime;
    } else {
      turns.push({
        ...(utt.speakerId !== undefined && { speakerId: utt.speakerId }),
        utterances: [utt],
        startTime: utt.startTime,
        endTime: utt.endTime,
      });
    }
  }

  const globalEnd =
    sorted.length > 0 ? sorted[sorted.length - 1]!.endTime : 0;

  const turnsXml = turns
    .map((turn) => {
      const spkAttr = turn.speakerId
        ? ` speaker="${escapeXml(turn.speakerId)}"`
        : '';
      const segments = turn.utterances
        .map((u) => {
          const text = u.transcription?.default ?? '';
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
<Trans program="${escapeXml(programTitle)}" air_date="${date}" scribe="" version="1" version_date="${date}">
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
    speakers.push({
      id,
      name: name ?? id,
      ...(el.getAttribute('xml:lang') != null && { lang: el.getAttribute('xml:lang')! }),
    });
  });

  const utterances: TrsImportResult['utterances'] = [];

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
      const text = collectText(childNodes).trim();
      if (text) {
        const startTime = parseFloat(turn.getAttribute('startTime') ?? '0');
        utterances.push({ startTime, endTime: turnEnd, transcription: text, ...(speakerId !== undefined && { speakerId }), ...(topic !== undefined && { topic }) });
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
      const text = collectText(textNodes).trim();

      // Skip zero-duration or empty segments
      if (endTime <= startTime || !text) continue;

      utterances.push({ startTime, endTime, transcription: text, ...(speakerId !== undefined && { speakerId }), ...(topic !== undefined && { topic }) });
    }
  });

  // Sort by startTime for consistency
  utterances.sort((a, b) => a.startTime - b.startTime);

  return { speakers, utterances };
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
