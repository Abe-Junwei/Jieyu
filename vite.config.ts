/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const zodCoreConfigEntry = resolve(repoRoot, 'node_modules/zod/v4/core/core.js');
import type { Plugin as RolldownPlugin } from 'rolldown';

// CI 环境提供 SENTRY_AUTH_TOKEN 时自动上传 source map 并删除本地产物 | Upload source maps in CI when SENTRY_AUTH_TOKEN is present
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();
const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();
const enableSentrySourceMaps = Boolean(sentryAuthToken && sentryOrg && sentryProject);

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version?: string };
const appVersion = typeof packageJson.version === 'string' && packageJson.version.trim().length > 0
  ? packageJson.version.trim()
  : '0.0.0-dev';

/**
 * 将 onnxruntime-web WASM 文件复制到构建输出，并在开发服务器中正确伺服。
 * Copies onnxruntime-web WASM files to build output and serves them correctly in dev server.
 */
/**
 * Vite 生产构建会把多段 HTML module 与 main 合并，导致 `jitless` 写入晚于 zod import。
 * 在 `transformIndexHtml` 的 **post** 阶段于 `main` 脚本之前插入可执行的 bootstrap（开发同理）。
 *
 * Vite prod merges HTML module entries with main so `jitless` runs too late; inject executable bootstrap before `main` in `transformIndexHtml` **post** (same for dev).
 */
function injectZodBootstrapExecBeforeMain(): Plugin {
  return {
    name: 'inject-zod-bootstrap-exec-before-main',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (html.includes('data-jieyu-zod-bootstrap-exec')) {
          return html;
        }
        if (ctx.server) {
          return html.replace(
            /(<script type="module" src="\/src\/main\.tsx"><\/script>)/,
            '<script type="module" src="/src/zodJitlessBootstrap.ts" data-jieyu-zod-bootstrap-exec="1"></script>\n    $1',
          );
        }
        return html.replace(
          /(<script type="module" crossorigin src="\/assets\/main-[^"]+\.js"><\/script>)/,
          '<script type="module" crossorigin src="/assets/zod-jitless-bootstrap.js" data-jieyu-zod-bootstrap-exec="1"></script>\n    $1',
        );
      },
    },
  };
}

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
 * Vite 8 依赖预构建使用 Rolldown；此处用 `transform` 等价替换原 esbuild `onLoad` 逻辑。
 * Vite 8 dep prebundle uses Rolldown; `transform` mirrors the previous esbuild `onLoad` hook.
 */
function muteSpectrogramWorkerThreads(): RolldownPlugin {
  const spectrogramFile = /spectrogram[\w.-]*\.js$/;
  return {
    name: 'mute-spectrogram-worker-threads',
    transform(code, id) {
      if (!id.includes('wavesurfer') || !spectrogramFile.test(id)) {
        return;
      }
      const next = code
        .replace(/module\.require\(\s*["']worker_threads["']\s*\)/g, '(void 0)')
        .replace(/__non_webpack_require__\(\s*["']worker_threads["']\s*\)/g, '(void 0)')
        .replace(/require\(\s*["']worker_threads["']\s*\)/g, '(void 0)');
      if (next === code) {
        return;
      }
      return { code: next };
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    /** Injected for Sentry default `release` and runtime diagnostics (see `resolveSentryBootstrapConfig`). */
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      // 包 exports 未列出该子路径；供 index.html 与 Vitest 在 classic zod 加载前写入 jitless
      'zod/v4/core/core.js': zodCoreConfigEntry,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '解语 Jieyu',
        short_name: 'Jieyu',
        description: '濒危语言科研协作平台',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'zh-CN',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        /**
         * Precache：壳层 + **冷启动直达 `/transcription` 所需** chunk（含语言子标签 / 语系 / 波形 / 自托管图标字体）。
         * 仍排除 ONNX/WASM 与模型目录，避免安装包膨胀到数十 MB。
         * Shell + chunks needed for cold `/transcription`; ONNX/WASM/models stay out of precache.
         */
        /**
         * Precaching: 壳层最小集使得冷启动离线可用。
         * 其他运行时加载的页面/面板/AI/Voice chunk 由 runtimeCaching StaleWhileRevalidate 覆盖。
         * Shell minimum for cold offline launch; everything else covered by runtimeCaching.
         */
        globPatterns: [
          'index.html',
          'favicon.svg',
          'fonts/**/*.css',
          'fonts/**/*.woff2',
          'data/language-support/iso6393-seed-rows.json',
          'data/language-support/language-display-names.core.json',
          'data/language-support/language-query-aliases.json',
          'assets/zod-jitless-bootstrap.js',
          'assets/main-*.js',
          'assets/main-*.css',
          'assets/react-vendor-*.js',
          'assets/zod-vendor-*.js',
          'assets/sentry-vendor-*.js',
          'assets/useQuery-*.js',
          'assets/useLatest-*.js',
          'assets/fireAndForget-*.js',
        ],
        globIgnores: [
          '**/onnx-wasm/**',
          '**/models/**',
          '**/*.{wasm,onnx}',
        ],
        /** 图标字体 ~4MB + language-subtag ~1.1MB；低于此会触发 vite-plugin-pwa 构建失败 | Font + subtag registry need headroom */
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => {
              if (url.origin !== self.location.origin || request.method !== 'GET') return false;
              const p = url.pathname;
              return p.endsWith('.js') || p.endsWith('.css') || request.destination === 'script' || request.destination === 'style';
            },
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'jieyu-runtime-js-css',
              expiration: {
                maxEntries: 140,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ request, url }) => {
              if (url.origin !== self.location.origin || request.method !== 'GET') return false;
              return url.pathname.endsWith('.woff2') || request.destination === 'font';
            },
            handler: 'CacheFirst',
            options: {
              cacheName: 'jieyu-runtime-fonts',
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      injectRegister: 'auto',
      devOptions: {
        /** 开发默认不启用 SW，避免与 Vite HMR 争抢；需要时用 `DEV_PWA=1 npm run dev` | Dev SW off by default; opt-in with DEV_PWA=1 */
        enabled: process.env.DEV_PWA === '1',
      },
    }),
    injectZodBootstrapExecBeforeMain(),
    copyOnnxWasm(),
    // Sentry source map 上传：仅在 CI 提供凭据时启用 | Sentry source map upload: only enabled when CI provides credentials
    ...(enableSentrySourceMaps
      ? [sentryVitePlugin({
          org: sentryOrg!,
          project: sentryProject!,
          authToken: sentryAuthToken!,
          release: { name: appVersion },
          sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        })]
      : []),
    // B-4：构建产物旁路写入 .br（`vite-plugin-compression` 多实例共享 mtimeCache，gzip+brotli 会导致后者全跳过，故仅启用 brotli）| .br siblings for static hosts; single algorithm due to plugin cache quirk
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 2048,
      filter: /\.(js|css|html|json|svg|txt|xml|webmanifest)$/,
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    rolldownOptions: {
      plugins: [muteSpectrogramWorkerThreads()],
    },
  },
  build: {
    reportCompressedSize: true,
    sourcemap: enableSentrySourceMaps ? 'hidden' : false,
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      input: {
        main: resolve(repoRoot, 'index.html'),
        zodJitlessBootstrap: resolve(repoRoot, 'src/zodJitlessBootstrap.ts'),
      },
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
        entryFileNames(chunkInfo) {
          if (chunkInfo.name === 'zodJitlessBootstrap') {
            return 'assets/zod-jitless-bootstrap.js';
          }
          return 'assets/[name]-[hash].js';
        },
        manualChunks(id) {
          // B-1：英文主词典独立 chunk，避免与入口主图合并（即使启动阶段会 preload）| Keep en-US dictionary out of the entry chunk
          if (id.includes('/src/i18n/dictionaries/en-US.ts')) {
            return 'i18n-en-US';
          }
          if (id.includes('/src/i18n/dictionaries/zh-CN.ts')) {
            return 'i18n-zh-CN';
          }
          // 保证 Zod 单实例，使 `globalConfig.jitless` 在异步 chunk（如 linguistic-core）中与入口一致 | Single Zod instance for shared globalConfig.jitless across async chunks
          if (id.includes('/node_modules/zod/')) {
            return 'zod-vendor';
          }
          if (
            id.includes('/src/services/JymService')
          ) {
            return 'TranscriptionPage.ImportExport.archive';
          }
          if (
            id.includes('/src/services/LayerSegmentationTextService.ts')
            || id.includes('/src/services/LayerSegmentGraphService.ts')
            || id.includes('/src/services/LayerUnitSegmentWriteService.ts')
            || id.includes('/src/services/LayerSegmentQueryService.ts')
            || id.includes('/src/ai/embeddings/EmbeddingInvalidationService.ts')
          ) {
            return 'linguistic-core-runtime';
          }
          if (
            id.includes('/node_modules/language-subtag-registry/')
            || id.includes('/node_modules/language-tags/')
          ) {
            return 'language-subtag-registry';
          }
          if (
            id.includes('/node_modules/iso-639-3/')
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
          if (id.includes('/@huggingface/transformers/')) {
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
    /* Playwright 规格放在 tests/e2e，由 npm run test:e2e 执行；勿让 Vitest 收集 | E2E specs run via Playwright only */
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    /* threads：单进程内跑用例，避免 forks 多进程各拉一份巨型 i18n 导致堆 OOM | Avoid per-fork duplicate heaps for large dict imports */
    pool: 'threads',
    setupFiles: [
      'src/zodJitlessBootstrap.ts',
      'src/test/vitestLocalStorageSetup.ts',
      'src/test/vitestJestDomSetup.ts',
      'src/test/vitestLanguageGeodataSetup.ts',
      'src/test/vitestI18nPreloadSetup.ts',
    ],
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
