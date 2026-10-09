/**
 * 自动切分来源记录：把 VAD 引擎、模型和参数写进 ProvenanceEnvelope.params，
 * 使每条机器切分的句段都能追溯“用什么、按什么参数”生成（rev5 冻结前登记）。
 *
 * Auto-segmentation provenance: records the VAD engine, model and parameters in
 * ProvenanceEnvelope.params so every machine-cut segment is traceable.
 */

import type { ProvenanceEnvelope, ProvenanceParams } from '../../db';
import { DEFAULT_VAD_SEGMENTATION_PARAMS } from '../../utils/vadWorkerInferenceUtils';
import { ENERGY_VAD_DEFAULTS } from '../VadService';

export type AutoSegmentationEngine = 'silero' | 'energy';

/** 结果来自缓存还是本次现算 | Whether segments came from the VAD cache or a fresh run */
export type AutoSegmentationSource = 'cache' | 'fresh';

/** Silero 模型文件（`scripts/download-silero-vad.sh`）| Silero model file */
const SILERO_VAD_MODEL_ID = 'silero_vad.onnx';
/**
 * 与 `scripts/download-silero-vad.sh` 钉死的版本一致（P11）。
 * Matches the pin in `scripts/download-silero-vad.sh` (P11).
 */
const SILERO_VAD_MODEL_VERSION = 'v6.2.3';
/** 与下载脚本 EXPECTED_SHA256 一致 | Matches the download script EXPECTED_SHA256 */
const SILERO_VAD_MODEL_SHA256 = '1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3';
/** 能量 VAD 是内置算法，版本随代码 | Built-in energy VAD, versioned with the code */
const ENERGY_VAD_MODEL_ID = 'jieyu-rms-energy-vad';
const ENERGY_VAD_MODEL_VERSION = '1';

/** 一次自动切分运行的描述 | Description of one auto-segmentation run */
export interface AutoSegmentationRun {
  engine: AutoSegmentationEngine;
  source: AutoSegmentationSource;
}

/**
 * 当前代码对这个引擎用的参数（不含 source）；VAD 缓存写入时存下这份（N9）。
 * Params the current code uses for this engine (no source); the VAD cache stores them on write (N9).
 */
export function vadRunParams(engine: AutoSegmentationEngine): ProvenanceParams {
  if (engine === 'silero') {
    return {
      engine: 'silero',
      vadModel: SILERO_VAD_MODEL_ID,
      vadModelVersion: SILERO_VAD_MODEL_VERSION,
      vadModelSha256: SILERO_VAD_MODEL_SHA256,
      ...DEFAULT_VAD_SEGMENTATION_PARAMS,
    };
  }
  return {
    engine: 'energy',
    vadModel: ENERGY_VAD_MODEL_ID,
    vadModelVersion: ENERGY_VAD_MODEL_VERSION,
    ...ENERGY_VAD_DEFAULTS,
  };
}

/**
 * 自动切分写入的句段一律是“机器初稿”（reviewStatus: suggested）。
 * Auto-cut segments are always machine drafts (reviewStatus: suggested).
 */
export function buildAutoSegmentationProvenance(
  run: AutoSegmentationRun,
  nowIso: string,
  /** 缓存命中时传缓存条目里存的参数（N9）| On a cache hit, the params stored with the entry (N9) */
  usedParams: ProvenanceParams = vadRunParams(run.engine),
): ProvenanceEnvelope {
  const params: ProvenanceParams = { ...usedParams, source: run.source };
  return {
    actorType: 'ai',
    method: 'auto-segmentation',
    model: String(params.vadModel),
    modelVersion: String(params.vadModelVersion),
    createdAt: nowIso,
    reviewStatus: 'suggested',
    params,
  };
}
