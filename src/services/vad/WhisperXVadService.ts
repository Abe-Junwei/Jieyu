/**
 * WhisperXVadService — WhisperX Cut & Merge VAD 高级服务层
 * High-level VAD service based on WhisperX Cut & Merge strategy.
 *
 * 通过 Worker 消息协议与 vadWorker 通信，将 Silero VAD ONNX 推理的结果
 * 暴露为简洁的 async API：`detectSpeechSegments(audioBuffer)`。
 *
 * Communicates with vadWorker via a Worker message protocol, exposing
 * Silero VAD ONNX inference as a clean async API.
 *
 * 架构说明 | Architecture note:
 *   - 主服务实例持有 Worker 引用，管理生命周期
 *   - 每次 `detectSpeechSegments` 发送一个带 UUID 的消息，等待对应 `result`
 *   - Worker 未加载时回退到基于能量的 VadService
 */

import { detectVadSegments } from '../VadService';
import type { VadWorkerSegment } from '../../workers/vadWorker';
import { createLogger } from '../../observability/logger';

const log = createLogger('WhisperXVadService');

export interface SpeechSegment {
  /** 语音段起始时间（秒）| Speech segment start in seconds */
  start: number;
  /** 语音段结束时间（秒）| Speech segment end in seconds */
  end: number;
  /** 置信度 [0, 1]，能量降级时为 undefined | Confidence [0, 1]; undefined when using energy fallback */
  confidence?: number;
}

export interface WhisperXVadOptions {
  /** VAD Worker 模型 URL，默认 '/models/silero_vad.onnx' */
  modelUrl?: string;
  /** 超时毫秒数（等待 Worker 就绪），默认 10 000 ms */
  initTimeoutMs?: number;
}

// ── WhisperXVadService ────────────────────────────────────────────────────────

export class WhisperXVadService {
  private worker: Worker | null = null;
  private ready = false;
  private pendingCallbacks = new Map<string, {
    resolve: (segs: SpeechSegment[]) => void;
    reject: (err: Error) => void;
  }>();

  constructor(private readonly options: WhisperXVadOptions = {}) {}

  /**
   * 初始化 Worker 并等待模型加载完成。
   * Initialises the Worker and waits for the model to load.
   */
  async init(): Promise<void> {
    if (this.ready) return;

    return new Promise((resolve, reject) => {
      const timeoutMs = this.options.initTimeoutMs ?? 10_000;
      const timer = setTimeout(() => {
        reject(new Error(`WhisperXVadService: Worker init timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        this.worker = new Worker(
          new URL('../../workers/vadWorker.ts', import.meta.url),
          { type: 'module' },
        );
      } catch (err) {
        clearTimeout(timer);
        reject(new Error(`WhisperXVadService: Failed to create Worker — ${err instanceof Error ? err.message : String(err)}`));
        return;
      }

      this.worker.onmessage = (event: MessageEvent) => {
        const msg = event.data as { type: string; id?: string; segments?: VadWorkerSegment[]; message?: string };

        if (msg.type === 'ready') {
          clearTimeout(timer);
          this.ready = true;
          resolve();
          return;
        }

        if (msg.type === 'result' && msg.id) {
          const cb = this.pendingCallbacks.get(msg.id);
          if (cb) {
            this.pendingCallbacks.delete(msg.id);
            cb.resolve((msg.segments ?? []).map((s) => ({
              start: s.start,
              end: s.end,
              confidence: s.confidence,
            })));
          }
          return;
        }

        if (msg.type === 'error') {
          log.warn('VAD Worker error', { message: msg.message });
          if (msg.id) {
            const cb = this.pendingCallbacks.get(msg.id);
            if (cb) {
              this.pendingCallbacks.delete(msg.id);
              cb.reject(new Error(msg.message ?? 'VAD worker error'));
            }
          } else if (!this.ready) {
            clearTimeout(timer);
            reject(new Error(msg.message ?? 'VAD worker error'));
          }
        }
      };

      this.worker.onerror = (err) => {
        log.warn('VAD Worker onerror', { message: err.message });
        clearTimeout(timer);
        if (!this.ready) reject(new Error(`VAD Worker error: ${err.message}`));
      };

      this.worker.postMessage({
        type: 'init',
        modelUrl: this.options.modelUrl ?? '/models/silero_vad.onnx',
      });
    });
  }

  /**
   * 对 AudioBuffer 执行 VAD，返回语音段列表。
   * 若 Worker 未初始化或不可用，自动回退到基于能量的 detectVadSegments。
   *
   * Detects speech segments in an AudioBuffer.
   * Falls back to energy-based detection if the Worker is unavailable.
   */
  async detectSpeechSegments(buffer: AudioBuffer): Promise<SpeechSegment[]> {
    if (!this.ready || !this.worker) {
      log.debug('VAD Worker not ready, falling back to energy-based VAD');
      return detectVadSegments(buffer).map((s) => ({ start: s.start, end: s.end }));
    }

    // 提取单声道 PCM | Extract mono PCM
    const pcm = extractMonoPcm(buffer);

    return new Promise<SpeechSegment[]>((resolve, reject) => {
      const id = generateId();
      this.pendingCallbacks.set(id, { resolve, reject });

      this.worker!.postMessage(
        { type: 'detect', id, pcm, sampleRate: buffer.sampleRate },
        [pcm.buffer], // 转移所有权避免拷贝 | Transfer ownership to avoid copy
      );
    });
  }

  /** 重置 Silero 隐藏状态（切换音频文件时调用）| Reset Silero hidden state (call on audio file switch) */
  resetState(): void {
    if (this.worker && this.ready) {
      this.worker.postMessage({ type: 'reset' });
    }
  }

  /** 销毁 Worker | Terminate the Worker */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    for (const cb of this.pendingCallbacks.values()) {
      cb.reject(new Error('WhisperXVadService disposed'));
    }
    this.pendingCallbacks.clear();
  }
}

// ── 工具函数 | Utility functions ─────────────────────────────────────────────

/**
 * 将 AudioBuffer 混音为单声道 Float32Array。
 * Downmix AudioBuffer to mono Float32Array.
 */
function extractMonoPcm(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const chData = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      mono[i]! += chData[i]!;
    }
  }
  if (buffer.numberOfChannels > 1) {
    const inv = 1 / buffer.numberOfChannels;
    for (let i = 0; i < len; i++) {
      mono[i]! *= inv;
    }
  }
  return mono;
}

/**
 * 生成轻量唯一 ID（取代 crypto.randomUUID 以避免 Worker 环境兼容性问题）。
 * Generates a lightweight unique ID.
 */
function generateId(): string {
  return `vad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
