/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Plugin as EsbuildPlugin } from 'esbuild';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version?: string };
const appVersion = typeof packageJson.version === 'string' && packageJson.version.trim().length > 0
  ? packageJson.version.trim()
  : '0.0.0-dev';

/**
 * 将 onnxruntime-web WASM 文件复制到构建输出，并在开发服务器中正确伺服。
 * Copies onnxruntime-web WASM files to build output and serves them correctly in dev server.
 */
function copyOnnxWasm(): Plugin {
  const wasmSrc = resolve('node_modules/onnxruntime-web/dist');
  const COPYABLE_SUFFIXES = ['.wasm', '.mjs', '.js', '.onnx_data'];
  const JS_EXT_PATTERN = /\.(mjs|js)$/;
  return {
    name: 'copy-onnx-wasm',
    // 开发模式：拦截 /onnx-wasm/* 请求（含 ?import），从 node_modules 返回正确 MIME | Dev: intercept /onnx-wasm/* requests (including ?import) and serve from node_modules with proper MIME
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url;
        const path = rawUrl?.split('?')[0] ?? '';
        if (path.startsWith('/onnx-wasm/') && COPYABLE_SUFFIXES.some((suffix) => path.endsWith(suffix))) {
          const filename = path.slice('/onnx-wasm/'.length);
          try {
            const data = readFileSync(join(wasmSrc, filename));
            if (filename.endsWith('.wasm')) {
              res.setHeader('Content-Type', 'application/wasm');
            } else if (JS_EXT_PATTERN.test(filename)) {
              res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            }
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
            res.end(data);
          } catch {
            next();
          }
        } else {
          next();
        }
      });
    },
    // 构建模式：复制到输出目录 | Build: copy to output directory
    closeBundle() {
      const outDir = resolve('dist/onnx-wasm');
      try {
        mkdirSync(outDir, { recursive: true });
        for (const file of readdirSync(wasmSrc)) {
          if (COPYABLE_SUFFIXES.some((suffix) => file.endsWith(suffix))) {
            copyFileSync(join(wasmSrc, file), join(outDir, file));
          }
        }
      } catch {
        // 静默失败：远程 provider 不需要 WASM | Silent fail: remote providers don't need WASM
      }
    },
  };
}

/**
 * wavesurfer.js 频谱图插件在模块顶层 require("worker_threads")，Vite 将其外部化后
 * 访问 .Worker 会产生浏览器兼容警告。此 esbuild 插件在依赖预构建阶段将该 require
 * 替换为 undefined，使其在 try/catch 中安全失败且不再输出警告。
 * The spectrogram plugin probes require("worker_threads") at module scope.
 * Vite externalises it with a proxy that logs a warning on property access.
 * This esbuild plugin replaces the require call with (void 0) during dep
 * pre-bundling so the existing try/catch silences it without the warning.
 */
function muteSpectrogramWorkerThreads(): EsbuildPlugin {
  return {
    name: 'mute-spectrogram-worker-threads',
    setup(build) {
      build.onLoad({ filter: /spectrogram[\w.-]*\.js$/ }, async (args) => {
        if (!args.path.includes('wavesurfer')) return undefined;
        let contents = readFileSync(args.path, 'utf-8');
        // 先替换限定形式，再替换裸 require，避免 module.(void 0) 语法错误
        // Replace qualified forms first, then bare require, to avoid module.(void 0) syntax error
        contents = contents
          .replace(/module\.require\(\s*["']worker_threads["']\s*\)/g, '(void 0)')
          .replace(/__non_webpack_require__\(\s*["']worker_threads["']\s*\)/g, '(void 0)')
          .replace(/require\(\s*["']worker_threads["']\s*\)/g, '(void 0)');
        return { contents, loader: 'js' };
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), copyOnnxWasm()],
  server: {
    host: true,
    port: 5173,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [muteSpectrogramWorkerThreads()],
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // onnxruntime-web 内部使用 eval，属于上游实现细节；此处只精确忽略该已知第三方告警 | onnxruntime-web uses eval internally; suppress only this known vendor warning
        if (
          warning.code === 'EVAL'
          && typeof warning.id === 'string'
          && warning.id.includes('/onnxruntime-web/')
        ) {
          return;
        }
        defaultHandler(warning);
      },
      output: {
        manualChunks(id) {
          if (
            id.includes('/src/services/JymService')
          ) {
            return 'TranscriptionPage.ImportExport.archive';
          }
          if (
            id.includes('/src/services/LayerSegmentationTextService.ts')
            || id.includes('/src/services/LayerSegmentGraphService.ts')
            || id.includes('/src/services/LegacyMirrorService.ts')
            || id.includes('/src/services/LayerSegmentQueryService.ts')
            || id.includes('/src/ai/embeddings/EmbeddingInvalidationService.ts')
          ) {
            return 'linguistic-core-runtime';
          }
          if (
            id.includes('/src/data/generated/languageNameCatalog.generated.ts')
          ) {
            return 'language-name-baseline';
          }
          if (
            id.includes('/node_modules/language-subtag-registry/')
            || id.includes('/node_modules/language-tags/')
          ) {
            return 'language-subtag-registry';
          }
          if (
            id.includes('/node_modules/iso-639-3/')
            || id.includes('/src/data/generated/iso6393Seed.generated.ts')
            || id.includes('/src/data/iso6393Seed.ts')
          ) {
            return 'language-iso-database';
          }
          if (
            id.includes('/src/data/languageNameCatalog.ts')
            || id.includes('/src/data/languageCatalogRuntimeCache.ts')
          ) {
            return 'language-display-runtime';
          }
          if (
            id.includes('/src/utils/langMapping.ts')
          ) {
            return 'language-mapping-runtime';
          }
          // 仅抽离语音域业务代码，降低主页面 chunk 且避免循环分包 | Extract only voice-domain app code to reduce main chunk without circular chunking
          if (id.includes('/src/services/VoiceInputService')) {
            return 'voice-input-runtime';
          }
          if (id.includes('/src/services/VoiceAgentService')) {
            return 'voice-agent-runtime';
          }
          if (id.includes('/src/services/stt/')) {
            return 'voice-stt-core';
          }
          if (
            id.includes('/src/hooks/useVoiceAgentDictationPipeline.ts')
            || id.includes('/src/services/SpeechAnnotationPipeline.ts')
          ) {
            return 'voice-dictation-runtime';
          }
          if (id.includes('/src/services/EarconService.ts')) {
            return 'voice-earcon-runtime';
          }
          if (id.includes('/src/services/WakeWordDetector.ts')) {
            return 'voice-wake-runtime';
          }
          if (
            id.includes('/src/services/IntentRouter.ts')
            || id.includes('/src/services/voiceIntentRefine.ts')
          ) {
            return 'voice-intent-runtime';
          }
          if (id.includes('/src/services/VoiceIntentLlmResolver.ts')) {
            return 'voice-intent-llm-runtime';
          }
          if (id.includes('/src/services/VoiceSessionStore.ts')) {
            return 'voice-session-runtime';
          }
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/@sentry/')) {
            return 'sentry-vendor';
          }
          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'react-vendor';
          }
          if (id.includes('/pdfjs-dist/')) {
            return 'pdf-vendor';
          }
          if (id.includes('/onnxruntime-web/')) {
            return 'onnxruntime-vendor';
          }
          if (id.includes('/@huggingface/transformers/') || id.includes('/@xenova/transformers/')) {
            return 'transformers-vendor';
          }
          if (id.includes('/@maptiler/') || id.includes('/maplibre-gl/')) {
            return 'map-vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/data/generated/**',
        'src/main.tsx',
      ],
    },
  },
});
