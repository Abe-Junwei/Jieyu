/**
 * VoiceInputService.recording — 录音/转写执行器
 * Recording capture and transcription executor
 *
 * Extracted from VoiceInputService to keep the main file focused on lifecycle and engine management.
 */

import type { SttResult, SttEngine, CommercialSttProvider } from './VoiceInputService';
import {
  buildWhisperTranscriptionEndpoints,
  createTranscriptionTimeoutController,
} from './VoiceInputService.probes';
import { createLogger } from '../observability/logger';
import { decodeEscapedUnicode } from '../utils/decodeEscapedUnicode';

const log = createLogger('VoiceInputService.recording');
const STT_TRANSCRIPTION_TIMEOUT_MS = 20_000;
const RECORDING_START_FAILED_MESSAGE = decodeEscapedUnicode('\\u5f55\\u97f3\\u542f\\u52a8\\u5931\\u8d25');
const RECORDING_STOP_FAILED_MESSAGE = decodeEscapedUnicode('\\u5f55\\u97f3\\u505c\\u6b62\\u5931\\u8d25');
const STT_TRANSCRIPTION_FAILED_MESSAGE = decodeEscapedUnicode('STT \\u8f6c\\u5199\\u5931\\u8d25');
const WHISPER_SERVER_TRANSCRIPTION_FAILED_PREFIX = decodeEscapedUnicode('whisper-server \\u8f6c\\u5199\\u5931\\u8d25. \\u5df2\\u5c1d\\u8bd5:\n');

export interface RecordingCallbacks {
  emitResult: (result: SttResult) => void;
  emitError: (error: string) => void;
}

/**
 * 录音/转写执行器 | Recording and transcription executor
 * Manages MediaRecorder capture and STT transcription via whisper-server or commercial providers.
 */
export class RecordingExecutor {
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private recordedChunks: Blob[] = [];
  private _isRecording = false;
  private _stopRecordingPromise: Promise<void> | null = null;

  constructor(private readonly callbacks: RecordingCallbacks) {}

  get isRecording(): boolean {
    return this._isRecording;
  }

  async startRecording(): Promise<void> {
    if (this._isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.mediaStream = stream;
      this.recordedChunks = [];
      // Prefer webm; fall back to any browser-supported format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        const err = (event as unknown as { error?: string }).error;
        this.callbacks.emitError(`MediaRecorder error: ${typeof err === 'string' ? err : (err ?? 'unknown')}`);
      };
      this.mediaRecorder = recorder;
      recorder.start(100); // chunk every 100ms for responsive stop
      this._isRecording = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : RECORDING_START_FAILED_MESSAGE;
      this.callbacks.emitError(message);
      throw new Error(message);
    }
  }

  async stopRecording(currentEngine: SttEngine, config: {
    whisperServerUrl?: string;
    whisperServerModel?: string;
    lang: string;
    commercialFallback?: CommercialSttProvider;
  }): Promise<void> {
    // Re-entrant guard: if a stop is already in flight, await it instead of racing
    if (this._stopRecordingPromise) {
      await this._stopRecordingPromise;
      return;
    }
    if (!this._isRecording || !this.mediaRecorder) return;

    this._stopRecordingPromise = this._stopRecordingInternal(currentEngine, config);
    try {
      await this._stopRecordingPromise;
    } finally {
      this._stopRecordingPromise = null;
    }
  }

  /** 释放录音相关资源 | Release recording resources */
  dispose(): void {
    this._isRecording = false;
    if (this.mediaRecorder) {
      try { this.mediaRecorder.stop(); } catch { /* ignore */ }
      this.mediaRecorder = null;
    }
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) track.stop();
      this.mediaStream = null;
    }
    this.recordedChunks = [];
    this._stopRecordingPromise = null;
  }

  // ── Internal | 内部实现 ──────────────────────────────────────────────────

  private async _stopRecordingInternal(currentEngine: SttEngine, config: {
    whisperServerUrl?: string;
    whisperServerModel?: string;
    lang: string;
    commercialFallback?: CommercialSttProvider;
  }): Promise<void> {
    const recorder = this.mediaRecorder;
    if (!recorder) return;
    const stream = this.mediaStream;

    this._isRecording = false;
    this.mediaRecorder = null;
    this.mediaStream = null;

    // Wait for final chunk(s) and recorder stop event.
    await new Promise<void>((resolve, reject) => {
      const dataHandler = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      const stopHandler = () => {
        recorder.removeEventListener('dataavailable', dataHandler);
        recorder.removeEventListener('error', errorHandler as EventListener);
        resolve();
      };
      const errorHandler = (event: Event) => {
        recorder.removeEventListener('dataavailable', dataHandler);
        recorder.removeEventListener('stop', stopHandler as EventListener);
        const err = (event as unknown as { error?: string }).error;
        reject(new Error(typeof err === 'string' ? err : RECORDING_STOP_FAILED_MESSAGE));
      };

      recorder.addEventListener('dataavailable', dataHandler);
      recorder.addEventListener('stop', stopHandler, { once: true });
      recorder.addEventListener('error', errorHandler as EventListener, { once: true });
      recorder.stop();
    });

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    if (this.recordedChunks.length === 0) {
      this.callbacks.emitError('No audio recorded');
      return;
    }

    const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
    this.recordedChunks = [];

    // Route based on the active engine: try the primary engine first,
    // fall back to the other if unavailable.
    if (currentEngine === 'commercial' && config.commercialFallback) {
      try {
        const commercialResult = await this.runCommercialTranscription(config.commercialFallback, audioBlob, config.lang);
        this.callbacks.emitResult(commercialResult);
        return;
      } catch (err) {
        // Commercial failed — try whisper-server as fallback
        await this._transcribeWithWhisperServerFallback(audioBlob, err, config);
        return;
      }
    }

    // Default: whisper-local (whisper-server on port 3040)
    await this._transcribeWithWhisperServerFallback(audioBlob, null, config);
  }

  private async _transcribeWithWhisperServerFallback(audioBlob: Blob, lastError: unknown, config: {
    whisperServerUrl?: string;
    whisperServerModel?: string;
    lang: string;
    commercialFallback?: CommercialSttProvider;
  }): Promise<void> {
    const baseUrl = config.whisperServerUrl?.replace(/\/+$/, '') ?? 'http://localhost:3040';
    const model = config.whisperServerModel ?? 'ggml-small-q5_k.bin';

    try {
      const result = await this.transcribeWithWhisperServer(audioBlob, baseUrl, model, config.lang);
      this.callbacks.emitResult(result);
    } catch (err) {
      if (config.commercialFallback) {
        try {
          const commercialResult = await this.runCommercialTranscription(config.commercialFallback, audioBlob, config.lang);
          this.callbacks.emitResult(commercialResult);
          return;
        } catch (fallbackErr) {
          log.warn('commercial fallback transcription failed', { fallbackErr });
          this.callbacks.emitError(lastError instanceof Error ? lastError.message : STT_TRANSCRIPTION_FAILED_MESSAGE);
          return;
        }
      }
      this.callbacks.emitError(err instanceof Error ? err.message : STT_TRANSCRIPTION_FAILED_MESSAGE);
    }
  }

  private async runCommercialTranscription(
    provider: CommercialSttProvider,
    audioBlob: Blob,
    lang: string,
  ): Promise<SttResult> {
    const { controller, clear } = createTranscriptionTimeoutController();
    try {
      return await provider.transcribe(audioBlob, lang, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`${provider.label} transcription timed out after ${STT_TRANSCRIPTION_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clear();
    }
  }

  private async transcribeWithWhisperServer(
    audioBlob: Blob,
    baseUrl: string,
    model: string,
    lang?: string,
  ): Promise<SttResult> {
    const endpoints = buildWhisperTranscriptionEndpoints(baseUrl);
    const failures: string[] = [];

    for (const endpoint of endpoints) {
      const body = new FormData();
      body.append('file', audioBlob, 'recording.webm');
      body.append('model', model);
      if (lang) body.append('language', lang);

      const { controller, clear } = createTranscriptionTimeoutController();
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          body,
          signal: controller.signal,
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          failures.push(`${endpoint} -> ${resp.status} ${text}`.trim());
          continue;
        }

        const json = await resp.json() as { text?: string };
        return {
          text: json.text ?? '',
          lang: lang ?? 'unknown',
          isFinal: true,
          confidence: 1.0,
          engine: 'whisper-local',
          audioBlob,
        };
      } catch (error) {
        const message = controller.signal.aborted
          ? `timed out after ${STT_TRANSCRIPTION_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : String(error);
        failures.push(`${endpoint} -> ${message}`);
      } finally {
        clear();
      }
    }

    throw new Error(`${WHISPER_SERVER_TRANSCRIPTION_FAILED_PREFIX}${failures.join('\n')}`);
  }
}
