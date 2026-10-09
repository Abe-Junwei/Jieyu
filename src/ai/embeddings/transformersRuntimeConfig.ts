export type TransformersEmbeddingDevice = 'webgpu' | 'wasm' | 'cpu';

type RequestAdapterLike = () => Promise<unknown>;

interface NavigatorGpuLike {
  requestAdapter: RequestAdapterLike;
}

export interface NavigatorLike {
  gpu?: NavigatorGpuLike;
}

interface TransformersModuleLike {
  env?: Record<string, unknown>;
  pipeline?: (
    task: 'feature-extraction',
    modelId: string,
    options: {
      device: TransformersEmbeddingDevice;
      dtype: 'q4';
      progress_callback?: (event: TransformersPipelineProgressEvent) => void;
    },
  ) => Promise<TransformersFeatureExtractionPipeline>;
}

interface TransformersPipelineProgressEvent {
  progress?: number;
  loaded?: number;
  total?: number;
  status?: string;
}

interface TransformersFeatureExtractionResult {
  data?: unknown;
}

export type TransformersFeatureExtractionPipeline = (
  text: string,
  options: {
    pooling: 'mean';
    normalize: true;
  },
) => Promise<TransformersFeatureExtractionResult>;

export interface ConfigureTransformersEmbeddingRuntimeOptions {
  transformers: TransformersModuleLike;
  workerHref?: string;
  cacheDir?: string;
  navigatorLike?: NavigatorLike;
  browserCacheAvailable?: boolean;
  browserRuntime?: boolean;
}

export interface TransformersEmbeddingRuntimeConfig {
  device: TransformersEmbeddingDevice;
  cacheDir: string;
  browserCacheEnabled: boolean;
  /** 是否清除了 transformers 的 CDN wasmPaths 默认值 | Whether transformers' CDN wasmPaths default was cleared */
  bundledWasmRuntime: boolean;
}

export interface CreateFeatureExtractionPipelineWithFallbackOptions {
  transformers: TransformersModuleLike;
  modelId: string;
  preferredDevice: TransformersEmbeddingDevice;
  progressCallback?: (event: TransformersPipelineProgressEvent) => void;
  onWebgpuFallback?: (error: unknown) => void;
}

const DEFAULT_BROWSER_CACHE_DIR = '/jieyu-models';
const DEFAULT_NODE_CACHE_DIR = '.jieyu-models';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

export function detectTransformersBrowserCacheAvailability(
  browserCacheAvailable: boolean | undefined = typeof globalThis.caches !== 'undefined',
): boolean {
  return browserCacheAvailable;
}

export function detectTransformersBrowserRuntime(
  browserRuntime: boolean | undefined = (() => {
    if (typeof window !== 'undefined') return true;
    const runtimeGlobal = globalThis as {
      self?: unknown;
      postMessage?: unknown;
    };
    return (
      typeof runtimeGlobal.self === 'object' &&
      runtimeGlobal.self === globalThis &&
      typeof runtimeGlobal.postMessage === 'function'
    );
  })(),
): boolean {
  return browserRuntime;
}

// 设备能力检测 | Device capability detection
export async function detectTransformersEmbeddingDevice(
  navigatorLike: NavigatorLike | undefined = globalThis.navigator as NavigatorLike | undefined,
  browserRuntime = detectTransformersBrowserRuntime(),
): Promise<TransformersEmbeddingDevice> {
  try {
    const gpu = navigatorLike?.gpu;
    if (!gpu) return browserRuntime ? 'wasm' : 'cpu';
    const adapter = await gpu.requestAdapter();
    return adapter ? 'webgpu' : browserRuntime ? 'wasm' : 'cpu';
  } catch {
    return browserRuntime ? 'wasm' : 'cpu';
  }
}

// 统一注入 v4 Worker 运行时配置 | Apply shared v4 worker runtime configuration
export async function configureTransformersEmbeddingRuntime(
  options: ConfigureTransformersEmbeddingRuntimeOptions,
): Promise<TransformersEmbeddingRuntimeConfig> {
  const browserRuntime = detectTransformersBrowserRuntime(options.browserRuntime);
  const device = await detectTransformersEmbeddingDevice(options.navigatorLike, browserRuntime);
  const cacheDir =
    options.cacheDir ?? (browserRuntime ? DEFAULT_BROWSER_CACHE_DIR : DEFAULT_NODE_CACHE_DIR);
  const browserCacheEnabled = detectTransformersBrowserCacheAvailability(
    options.browserCacheAvailable,
  );
  const env = asRecord(options.transformers.env);
  let bundledWasmRuntime = false;

  if (env) {
    env.cacheDir = cacheDir;
    env.useBrowserCache = browserCacheEnabled;

    // transformers 在导入时把 wasmPaths 默认指向 jsDelivr CDN（被 CSP script-src 'self' 拦截，且离线不可用）。
    // 以前这里改成 Worker 所在目录，但构建产物里没有未哈希的 ort-wasm-simd-threaded.asyncify.mjs，加载必然失败并静默回退到哈希嵌入。
    // 清除 wasmPaths 后，ORT bundle 使用内嵌的 wasm 工厂，并通过 new URL(..., import.meta.url) 加载打包器产出的同版本 .wasm。
    // transformers sets wasmPaths to the jsDelivr CDN on import (blocked by CSP script-src 'self', unavailable offline).
    // Pointing it at the worker directory never worked either: the build emits no unhashed asyncify .mjs, so session
    // creation failed and the worker silently fell back to hash embeddings. Clearing wasmPaths lets the ORT bundle use its
    // embedded wasm factory and the bundler-emitted, version-matched .wasm asset (new URL(..., import.meta.url)).
    const backends = asRecord(env.backends);
    const onnx = asRecord(backends?.onnx);
    const wasm = asRecord(onnx?.wasm);
    if (wasm && browserRuntime) {
      delete wasm.wasmPaths;
      bundledWasmRuntime = true;
    }
  }

  return {
    device,
    cacheDir,
    browserCacheEnabled,
    bundledWasmRuntime,
  };
}

export async function createFeatureExtractionPipelineWithFallback(
  options: CreateFeatureExtractionPipelineWithFallbackOptions,
): Promise<{
  pipeline: TransformersFeatureExtractionPipeline;
  device: TransformersEmbeddingDevice;
}> {
  if (typeof options.transformers.pipeline !== 'function') {
    throw new Error('Transformers pipeline is unavailable');
  }

  const loadPipeline = async (device: TransformersEmbeddingDevice) =>
    options.transformers.pipeline!('feature-extraction', options.modelId, {
      device,
      dtype: 'q4',
      ...(options.progressCallback ? { progress_callback: options.progressCallback } : {}),
    });

  try {
    return {
      pipeline: await loadPipeline(options.preferredDevice),
      device: options.preferredDevice,
    };
  } catch (error) {
    if (options.preferredDevice !== 'webgpu') {
      throw error;
    }

    options.onWebgpuFallback?.(error);
    return {
      pipeline: await loadPipeline('wasm'),
      device: 'wasm',
    };
  }
}
