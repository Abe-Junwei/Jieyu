/**
 * WebMAUS forced alignment service — minimum viable implementation.
 *
 * BAS WebMAUS (Munich Automatic Segmentation) is a remote forced alignment API
 * that accepts audio + transcript and returns word/phoneme-level timestamps
 * in TextGrid format.
 *
 * Architecture:
 * 1. Convert audio to WAV (MediaRecorder produces WebM/Opus; WebMAUS requires WAV)
 * 2. POST audio + transcript text to WebMAUS via CORS proxy
 * 3. Extract task ID from response
 * 4. Poll for completion
 * 5. Parse returned TextGrid into aligned intervals
 *
 * CORS: BAS does not support direct browser requests. Set `corsProxyUrl` in
 * config to your own proxy (e.g., a Cloudflare Worker or Express relay).
 * The proxy must forward requests to `https://webservice.bas.uni-muenchen.ac.kr`.
 *
 * @see https://webservice.bas.uni-muenchen.ac.kr (API documentation)
 */

import type { UtteranceDocType } from '../../db';

export type WebMaService = 'maus' | 'mausg2' | 'maus1';
export type WebMaLanguage =
  | 'eng' | 'deu' | 'fra' | 'spa' | 'ita' | 'por' | 'rus'
  | 'cmn' | 'jpn' | 'kor' | 'vie' | 'tha' | 'pol' | 'ces'
  | 'nld' | 'hun' | 'ron' | 'ukr' | 'swe' | 'dan' | 'nor'
  | 'fin' | 'lav' | 'lit' | 'est' | 'tur' | 'ara' | 'heb'
  | 'hin' | 'ben' | 'tam' | 'tel' | 'mar' | 'kan'
  | string; // WebMAUS supports 80+ languages; unknown codes passed through

export interface WebMaConfig {
  /** CORS proxy base URL (e.g. https://your-proxy.workers.dev).
   *  The service appends the target URL as a query parameter.
   *  Set to empty string to disable proxy (will fail with CORS in browsers). */
  corsProxyUrl?: string;
  /** WebMAUS service variant (default: 'maus' = standard MAUS). */
  service?: WebMaService;
  /** Language code in ISO 639-3 (WebMAUS uses ISO 639-1 for some languages). */
  language?: WebMaLanguage;
  /** Poll interval in ms (default: 2000). */
  pollIntervalMs?: number;
  /** Max poll attempts before giving up (default: 30 → 60s). */
  maxPollAttempts?: number;
}

export interface WebMaAlignmentResult {
  /** The task ID returned by WebMAUS. */
  taskId: string;
  /** Parsed word-level intervals from the TextGrid. */
  words: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
  /** Parsed phoneme-level intervals (if available from WebMAUS). */
  phonemes: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
  /** Raw TextGrid content returned by WebMAUS. */
  rawTextGrid: string;
}

export interface WebMaProgress {
  status: 'submitting' | 'processing' | 'done' | 'error';
  progress?: number; // 0–100 when status === 'processing'
  message?: string;
}

const DEFAULT_CONFIG: Required<WebMaConfig> = {
  corsProxyUrl: '',
  service: 'maus',
  language: 'eng',
  pollIntervalMs: 2000,
  maxPollAttempts: 30,
};

const BAS_BASE_URL = 'https://webservice.bas.uni-muenchen.ac.kr';
const SUBMIT_ENDPOINT = `${BAS_BASE_URL}/cgi-bin/G2Align/G2AlignSrv.exe`;
const POLL_ENDPOINT = SUBMIT_ENDPOINT;

// ── WAV Encoding ─────────────────────────────────────────────────────────────

/**
 * Convert a WebM/Opus audio blob to a WAV blob.
 * MediaRecorder produces WebM; WebMAUS requires WAV.
 */
export async function audioBlobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBufferToWav(audioBuffer);
  } finally {
    await audioContext.close();
  }
}

function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = audioBuffer.length * blockAlign;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write interleaved PCM samples
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = channels[ch];
      if (!channelData) continue;
      const sample = Math.max(-1, Math.min(1, channelData[i] ?? 0));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ── TextGrid Parsing ─────────────────────────────────────────────────────────

/**
 * Parse a Praat TextGrid string into word and phoneme intervals.
 * WebMAUS returns a standard long TextGrid format.
 *
 * Uses a tier-by-tier parsing strategy: split by 'item [' first, then
 * extract the tier name from each item's header, then parse intervals
 * within that item's scope. This avoids cross-tier contamination.
 */
export function parseTextGrid(textGrid: string): {
  words: Array<{ text: string; startTime: number; endTime: number }>;
  phonemes: Array<{ text: string; startTime: number; endTime: number }>;
} {
  const words: Array<{ text: string; startTime: number; endTime: number }> = [];
  const phonemes: Array<{ text: string; startTime: number; endTime: number }> = [];

  // Split into tiers using 'item [' as delimiter (same approach as praatio)
  const tierList = textGrid.split('item [');

  // tierList[0] = header (before first 'item ['), tierList[1..] = each tier
  tierList.shift();

  for (const tierTxt of tierList) {
    // Determine tier type and name from the header (before 'intervals:' or 'points:')
    const isIntervalTier = tierTxt.includes('class = "IntervalTier"');
    const searchWord = isIntervalTier ? 'intervals:' : 'points:';

    const parts = tierTxt.split(searchWord, 2);
    if (parts.length < 2) continue; // malformed tier

    const header = parts[0];
    const tierData = parts[1];

    // Extract tier name from header
    const nameMatch = header.match(/name = "([^"]+)"/);
    if (!nameMatch) continue;
    const tierName = nameMatch[1]!.toLowerCase();

    if (!isIntervalTier) continue; // skip point tiers for now

    // Classify tier type
    const isWordTier =
      tierName.includes('word') || tierName.includes('ort') || tierName === 'words';
    const isPhonemeTier =
      tierName.includes('phon') ||
      tierName.includes('kalt') ||
      tierName.includes('sampa') ||
      tierName === 'mau';

    // Parse intervals: look for xmin, xmax, text in sequence
    let offset = 0;
    while (offset < tierData.length) {
      const xminIdx = tierData.indexOf('xmin =', offset);
      if (xminIdx === -1) break;
      const xmaxIdx = tierData.indexOf('xmax =', xminIdx);
      if (xmaxIdx === -1) break;
      const textIdx = tierData.indexOf('text =', xmaxIdx);
      if (textIdx === -1) break;

      const xminLine = tierData.substring(xminIdx + 7, tierData.indexOf('\n', xminIdx + 7)).trim();
      const xmaxLine = tierData.substring(xmaxIdx + 7, tierData.indexOf('\n', xmaxIdx + 7)).trim();
      const textLine = tierData.substring(textIdx + 7, tierData.indexOf('\n', textIdx + 7)).trim();

      const textContent = textLine.replace(/^"(.*)"$/, '$1');
      const start = parseFloat(xminLine);
      const end = parseFloat(xmaxLine);

      if (!isNaN(start) && !isNaN(end) && textContent && textContent !== '<#>' && textContent !== '<SP>') {
        if (isWordTier) {
          words.push({ text: textContent, startTime: start, endTime: end });
        } else if (isPhonemeTier) {
          phonemes.push({ text: textContent, startTime: start, endTime: end });
        } else if (words.length === 0 && phonemes.length === 0 && /[a-zA-Z\u4e00-\u9fff]/.test(textContent)) {
          // First unnamed tier — treat as words
          words.push({ text: textContent, startTime: start, endTime: end });
        }
      }

      offset = textIdx + 7;
    }
  }

  return { words, phonemes };
}

// ── WebMAUS Service ─────────────────────────────────────────────────────────

function buildSubmitFormData(
  audioBlob: Blob,
  transcript: string,
  language: WebMaLanguage,
  service: WebMaService,
): FormData {
  const formData = new FormData();
  // Caller ensures audioBlob is already WAV (see align()).
  formData.append('AUDIO', audioBlob, 'recording.wav');
  formData.append('TEXT', new File([transcript], 'transcript.txt', { type: 'text/plain' }));
  formData.append('LANGUAGE', language);
  formData.append('SERVICE', service);
  return formData;
}

export class WebMaServiceClient {
  private readonly config: Required<WebMaConfig>;

  constructor(config: WebMaConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Submit an alignment job and wait for the result.
   *
   * @param audioBlob  Audio recording (WebM/Opus or WAV).
   * @param transcript Plain text transcript of the audio.
   * @param onProgress Called with progress updates.
   */
  async align(
    audioBlob: Blob,
    transcript: string,
    onProgress?: (progress: WebMaProgress) => void,
  ): Promise<WebMaAlignmentResult> {
    const { corsProxyUrl, language, service, pollIntervalMs, maxPollAttempts } = this.config;

    // Convert to WAV if needed (WebMAUS requires WAV; MediaRecorder gives WebM)
    let audioToSend: Blob = audioBlob;
    if (!audioBlob.type.includes('wav') && !audioBlob.type.includes('wav')) {
      try {
        onProgress?.({ status: 'submitting', message: 'Converting audio to WAV…' });
        audioToSend = await audioBlobToWav(audioBlob);
      } catch (err) {
        throw new Error(
          `Audio conversion failed: ${err instanceof Error ? err.message : String(err)}. Try passing a WAV blob directly.`,
        );
      }
    }

    // Step 1: Submit job
    onProgress?.({ status: 'submitting', message: 'Submitting to WebMAUS…' });

    const submitUrl = corsProxyUrl
      ? `${corsProxyUrl.replace(/\/$/, '')}/${encodeURIComponent(SUBMIT_ENDPOINT)}`
      : SUBMIT_ENDPOINT;

    let submitResp: Response;
    try {
      submitResp = await fetch(submitUrl, {
        method: 'POST',
        body: buildSubmitFormData(audioToSend, transcript, language, service),
      });
    } catch (err) {
      throw new Error(
        `Failed to submit alignment job${corsProxyUrl ? ' (check CORS proxy)' : ''}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (!submitResp.ok) {
      const body = await submitResp.text().catch(() => '');
      throw new Error(`WebMAUS submission failed (${submitResp.status}): ${body}`);
    }

    const responseText = await submitResp.text();
    const taskId = extractTaskId(responseText);
    if (!taskId) {
      throw new Error(`Could not parse task ID from WebMAUS response: ${responseText.slice(0, 200)}`);
    }

    // Step 2: Poll for completion
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      await sleep(pollIntervalMs);

      const pollUrl = corsProxyUrl
        ? `${corsProxyUrl.replace(/\/$/, '')}/${encodeURIComponent(
            `${POLL_ENDPOINT}?ANNOTATION=${service}&TASKID=${taskId}`,
          )}`
        : `${POLL_ENDPOINT}?ANNOTATION=${service}&TASKID=${taskId}`;

      let pollResp: Response;
      try {
        pollResp = await fetch(pollUrl);
      } catch (err) {
        // Network error — keep polling
        onProgress?.({
          status: 'processing',
          progress: Math.round((attempt / maxPollAttempts) * 100),
          message: `Poll attempt ${attempt + 1} failed, retrying…`,
        });
        continue;
      }

      if (!pollResp.ok) {
        // Not ready or error — keep polling
        continue;
      }

      const pollText = await pollResp.text();

      // If the response is a TextGrid (not an error message), we're done
      if (pollText.includes('FileType') && pollText.includes('xmin')) {
        const { words, phonemes } = parseTextGrid(pollText);
        return {
          taskId,
          words,
          phonemes,
          rawTextGrid: pollText,
        };
      }

      // Still processing or error message
      onProgress?.({
        status: 'processing',
        progress: Math.min(95, Math.round((attempt / maxPollAttempts) * 100)),
        message: `Processing… (${attempt + 1}/${maxPollAttempts})`,
      });
    }

    throw new Error(
      `WebMAUS alignment timed out after ${maxPollAttempts} poll attempts. ` +
        'Try a shorter audio clip or check your CORS proxy.',
    );
  }

  /**
   * Match WebMAUS word intervals to existing utterances.
   *
   * WebMAUS returns word-level timestamps for the entire transcript.
   * This function aligns those words to the utterance boundaries already
   * defined in the project.
   *
   * @param words WebMAUS word intervals (already parsed).
   * @param utterances Existing utterances from the project.
   * @returns Map of utterance ID → aligned word intervals.
   */
  matchWordsToUtterances(
    words: Array<{ text: string; startTime: number; endTime: number }>,
    utterances: UtteranceDocType[],
  ): Map<string, Array<{ text: string; startTime: number; endTime: number }>> {
    const result = new Map<string, Array<{ text: string; startTime: number; endTime: number }>>();

    // Sort utterances by start time
    const sorted = [...utterances].sort((a, b) => a.startTime - b.startTime);

    for (const utterance of sorted) {
      const uttWords = words.filter(
        (w) => w.startTime >= utterance.startTime && w.endTime <= utterance.endTime,
      );
      if (uttWords.length > 0) {
        result.set(utterance.id, uttWords);
      }
    }

    return result;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractTaskId(response: string): string | null {
  // WebMAUS returns plain text: "TaskId: <id>" or just "<id>"
  const match = response.match(/TaskId:\s*(\S+)/i) ?? response.match(/(\S{8,})/);
  return match?.[1] ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
