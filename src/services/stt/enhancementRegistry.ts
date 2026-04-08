import type { SttEngine } from '../VoiceInputService';

export type SttEnhancementKind = 'whisperx-align' | 'mfa-align' | 'pyannote-diarize';
export type SttEnhancementSelectionKind = SttEnhancementKind | 'none';
export type SttEnhancementCapability = 'word-alignment' | 'forced-alignment' | 'speaker-diarization';
export type SttEnhancementRuntime = 'external-python' | 'external-service';
export type SttEnhancementFailureKind = 'missing-config' | 'timeout' | 'network' | 'http' | 'unknown';

export interface SttEnhancementConfig {
  endpointUrl?: string;
  model?: string;
  language?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface SttEnhancementWordTiming {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface SttEnhancementSpeakerTurn {
  speaker: string;
  start: number;
  end: number;
}

export interface SttEnhancementInput {
  transcriptText: string;
  lang: string;
  audioBlob?: Blob;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export interface SttEnhancementOutput {
  wordTimings?: SttEnhancementWordTiming[];
  speakerTurns?: SttEnhancementSpeakerTurn[];
  debug?: Record<string, unknown>;
}

export interface SttEnhancementProvider {
  readonly kind: SttEnhancementKind;
  isAvailable(config: SttEnhancementConfig): Promise<boolean>;
  enhance(input: SttEnhancementInput, config: SttEnhancementConfig): Promise<SttEnhancementOutput>;
}

export interface SttEnhancementProviderDefinition {
  kind: SttEnhancementKind;
  label: string;
  description: string;
  capability: SttEnhancementCapability;
  runtime: SttEnhancementRuntime;
  compatibleEngines: SttEngine[];
  experimental: boolean;
}

export interface SttEnhancementReachability {
  kind: SttEnhancementKind;
  available: boolean;
  error?: string;
  errorKind?: SttEnhancementFailureKind;
}

function classifySttEnhancementError(error: unknown): { error: string; errorKind: SttEnhancementFailureKind } {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('required')) {
    return { error: message, errorKind: 'missing-config' };
  }
  if (normalized.includes('timeout') || normalized.includes('timed out') || normalized.includes('aborted')) {
    return { error: message, errorKind: 'timeout' };
  }
  if (normalized.includes('failed:') || normalized.includes(' 4') || normalized.includes(' 5')) {
    return { error: message, errorKind: 'http' };
  }
  if (normalized.includes('fetch') || normalized.includes('network') || normalized.includes('unreachable')) {
    return { error: message, errorKind: 'network' };
  }
  return { error: message, errorKind: 'unknown' };
}

class HttpSttEnhancementProvider implements SttEnhancementProvider {
  readonly kind: SttEnhancementKind;

  constructor(kind: SttEnhancementKind) {
    this.kind = kind;
  }

  async isAvailable(config: SttEnhancementConfig): Promise<boolean> {
    const endpointUrl = config.endpointUrl?.trim();
    if (!endpointUrl) return false;
    try {
      const response = await fetch(endpointUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok || response.status === 405;
    } catch {
      return false;
    }
  }

  async enhance(input: SttEnhancementInput, config: SttEnhancementConfig): Promise<SttEnhancementOutput> {
    const endpointUrl = config.endpointUrl?.trim();
    if (!endpointUrl) {
      throw new Error('Enhancement endpoint is required');
    }

    const body = new FormData();
    body.append('provider', this.kind);
    body.append('text', input.transcriptText);
    body.append('lang', config.language?.trim() || input.lang);
    if (config.model) body.append('model', String(config.model));
    if (input.audioBlob) {
      body.append('file', input.audioBlob, 'recording.webm');
    }
    if (input.segments && input.segments.length > 0) {
      body.append('segments', JSON.stringify(input.segments));
    }

    const response = await fetch(endpointUrl, {
      method: 'POST',
      body,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Enhancement request failed: ${response.status} ${text}`.trim());
    }

    const json = await response.json() as Partial<SttEnhancementOutput>;
    return {
      ...(Array.isArray(json.wordTimings) ? { wordTimings: json.wordTimings } : {}),
      ...(Array.isArray(json.speakerTurns) ? { speakerTurns: json.speakerTurns } : {}),
      ...(json.debug ? { debug: json.debug } : {}),
    };
  }
}

export const sttEnhancementDefinitions: SttEnhancementProviderDefinition[] = [
  {
    kind: 'whisperx-align',
    label: 'WhisperX Alignment',
    description: 'Add word-level timings and segment alignment to STT output.',
    capability: 'word-alignment',
    runtime: 'external-python',
    compatibleEngines: ['whisper-local', 'commercial'],
    experimental: true,
  },
  {
    kind: 'mfa-align',
    label: 'Montreal Forced Aligner',
    description: 'Forced-alignment extension slot for research and annotation workflows.',
    capability: 'forced-alignment',
    runtime: 'external-python',
    compatibleEngines: ['whisper-local', 'commercial'],
    experimental: true,
  },
  {
    kind: 'pyannote-diarize',
    label: 'Pyannote Diarization',
    description: 'Speaker diarization entry point for multi-speaker audio.',
    capability: 'speaker-diarization',
    runtime: 'external-service',
    compatibleEngines: ['whisper-local', 'commercial'],
    experimental: true,
  },
];

export function getCompatibleSttEnhancements(engine: SttEngine): SttEnhancementProviderDefinition[] {
  return sttEnhancementDefinitions.filter((definition) => definition.compatibleEngines.includes(engine));
}

export function createSttEnhancementProvider(kind: SttEnhancementKind): SttEnhancementProvider {
  return new HttpSttEnhancementProvider(kind);
}

export async function testSttEnhancementProvider(
  kind: SttEnhancementKind,
  config: SttEnhancementConfig,
) : Promise<SttEnhancementReachability> {
  const endpointUrl = config.endpointUrl?.trim();
  if (!endpointUrl) {
    return {
      kind,
      available: false,
      error: 'Enhancement endpoint is required',
      errorKind: 'missing-config',
    };
  }

  try {
    const provider = createSttEnhancementProvider(kind);
    const available = await provider.isAvailable(config);
    if (available) {
      return { kind, available: true };
    }

    return {
      kind,
      available: false,
      error: 'Enhancement endpoint unreachable',
      errorKind: 'network',
    };
  } catch (error) {
    const classified = classifySttEnhancementError(error);
    return {
      kind,
      available: false,
      error: classified.error,
      errorKind: classified.errorKind,
    };
  }
}