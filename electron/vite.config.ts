import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const external = [
  'electron',
  'better-sqlite3',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
];

export default defineConfig({
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
