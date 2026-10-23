import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const external = [
  'electron',
  'better-sqlite3',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
];

export default defineConfig({
  resolve: {
    alias: {
      '@sqlite-host': path.join(root, 'src/desktop/skeleton/sqliteStorageHost.ts'),
    },
  },
  build: {
    ssr: true,
    outDir: 'electron/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: 'electron/main.ts' },
      external,
      output: { entryFileNames: '[name].js', format: 'es' },
    },
  },
});
