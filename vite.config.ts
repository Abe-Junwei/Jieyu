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
    rollupOptions: {
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
          if (
            id.includes('/src/hooks/useVoice')
            || id.includes('/src/components/Voice')
            || id.includes('/src/services/Voice')
            || id.includes('/src/services/IntentRouter')
          ) {
            return 'voice-core';
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
          if (id.includes('/@xenova/transformers/') || id.includes('/onnxruntime-web/')) {
            return 'ai-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
