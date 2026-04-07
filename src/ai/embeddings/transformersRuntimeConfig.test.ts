import { describe, expect, it, vi } from 'vitest';

import {
  createFeatureExtractionPipelineWithFallback,
  configureTransformersEmbeddingRuntime,
  detectTransformersEmbeddingDevice,
  resolveTransformersWorkerWasmPath,
} from './transformersRuntimeConfig';

describe('transformersRuntimeConfig', () => {
  it('prefers webgpu when navigator.gpu returns an adapter', async () => {
    await expect(detectTransformersEmbeddingDevice({
      gpu: {
        requestAdapter: async () => ({ name: 'mock-adapter' }),
      },
    })).resolves.toBe('webgpu');
  });

  it('falls back to wasm when navigator.gpu is unavailable', async () => {
    await expect(detectTransformersEmbeddingDevice(undefined)).resolves.toBe('wasm');
    await expect(detectTransformersEmbeddingDevice({
      gpu: {
        requestAdapter: async () => null,
      },
    })).resolves.toBe('wasm');
  });

  it('derives same-origin wasm path from worker href', () => {
    expect(resolveTransformersWorkerWasmPath('https://example.com/assets/embedding.worker.js?hash=1')).toBe(
      'https://example.com/assets/',
    );
    expect(resolveTransformersWorkerWasmPath('/node_modules/pkg/embedding.worker.js')).toBeUndefined();
  });

  it('applies cache and wasm runtime settings to transformers env', async () => {
    const transformers: {
      env: {
        cacheDir?: string;
        useBrowserCache?: boolean;
        backends: {
          onnx: {
            wasm: {
              wasmPaths?: string;
            };
          };
        };
      };
    } = {
      env: {
        backends: {
          onnx: {
            wasm: {},
          },
        },
      },
    };

    const runtime = await configureTransformersEmbeddingRuntime({
      transformers,
      workerHref: 'https://example.com/assets/embedding.worker.js',
      navigatorLike: {
        gpu: {
          requestAdapter: async () => ({ name: 'mock-adapter' }),
        },
      },
    });

    expect(runtime).toEqual({
      device: 'webgpu',
      cacheDir: '/jieyu-models',
      browserCacheEnabled: true,
      wasmPaths: 'https://example.com/assets/',
    });
    expect(transformers.env.cacheDir).toBe('/jieyu-models');
    expect(transformers.env.useBrowserCache).toBe(true);
    expect(transformers.env.backends.onnx.wasm.wasmPaths).toBe('https://example.com/assets/');
  });

  it('falls back from webgpu to wasm when pipeline init fails on webgpu', async () => {
    const calls: Array<'webgpu' | 'wasm'> = [];
    const fallbackSpy = vi.fn();
    const pipeline = vi.fn(async () => ({ data: [1, 2, 3] }));

    const result = await createFeatureExtractionPipelineWithFallback({
      modelId: 'test-model',
      preferredDevice: 'webgpu',
      onWebgpuFallback: fallbackSpy,
      transformers: {
        pipeline: async (_task, _modelId, options) => {
          calls.push(options.device);
          if (options.device === 'webgpu') {
            throw new Error('webgpu unsupported op');
          }
          return pipeline;
        },
      },
    });

    expect(calls).toEqual(['webgpu', 'wasm']);
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(result.device).toBe('wasm');
    await expect(result.pipeline('hello', { pooling: 'mean', normalize: true })).resolves.toEqual({ data: [1, 2, 3] });
  });

  it('does not fall back when preferred device is already wasm', async () => {
    await expect(createFeatureExtractionPipelineWithFallback({
      modelId: 'test-model',
      preferredDevice: 'wasm',
      transformers: {
        pipeline: async () => {
          throw new Error('wasm init failed');
        },
      },
    })).rejects.toThrow('wasm init failed');
  });
});