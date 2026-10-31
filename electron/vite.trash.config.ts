import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const external = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
];

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'electron/dist',
    emptyOutDir: false,
    rollupOptions: {
      input: { trashProbe: path.join(root, 'electron/trashProbe.ts') },
      external,
      output: { entryFileNames: '[name].js', format: 'es' },
    },
  },
});
