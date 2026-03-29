import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * 将 onnxruntime-web WASM 文件复制到构建输出，供 @xenova/transformers Worker 运行时加载。
 * Copies onnxruntime-web WASM files to build output so the @xenova/transformers worker can load them at runtime.
 */
function copyOnnxWasm(): Plugin {
  return {
    name: 'copy-onnx-wasm',
    apply: 'build',
    closeBundle() {
      const outDir = resolve('dist/assets');
      const wasmSrc = resolve('node_modules/onnxruntime-web/dist');
      try {
        mkdirSync(outDir, { recursive: true });
        for (const file of readdirSync(wasmSrc)) {
          if (file.endsWith('.wasm')) {
            copyFileSync(join(wasmSrc, file), join(outDir, file));
          }
        }
      } catch {
        // 静默失败：远程 provider 不需要 WASM | Silent fail: remote providers don't need WASM
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyOnnxWasm()],
  server: {
    host: true,
    port: 5173,
  },
  worker: {
    format: 'es',
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
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
          // 已有 lazy 边界的语音 UI / runtime 不应被粗粒度 voice-core 吞并 | Preserve existing lazy boundaries for voice UI and runtime wiring
          if (id.includes('/src/components/VoiceAgentWidget')) {
            return 'voice-widget';
          }
          if (id.includes('/src/hooks/useVoiceAgent.ts')) {
            return 'voice-agent-core';
          }
          if (
            id.includes('/src/services/IntentRouter.ts')
            || id.includes('/src/services/voiceIntentRefine.ts')
            || id.includes('/src/services/VoiceIntentLlmResolver.ts')
          ) {
            return 'voice-intent-runtime';
          }
          if (id.includes('/src/services/VoiceSessionStore.ts')) {
            return 'voice-session-runtime';
          }
          if (
            id.includes('/src/hooks/useVoiceDock.ts')
            || id.includes('/src/hooks/useVoiceInteraction.ts')
            || id.includes('/src/services/EarconService.ts')
            || id.includes('/src/services/WakeWordDetector.ts')
            || id.includes('/src/services/voiceIntentUi.ts')
          ) {
            return 'voice-agent-core';
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
          if (id.includes('/@xenova/transformers/')) {
            return 'transformers-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
