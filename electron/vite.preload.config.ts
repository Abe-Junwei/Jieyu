import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'electron/dist',
    emptyOutDir: false,
    rollupOptions: {
      input: { preload: 'electron/preload.ts' },
      external: ['electron'],
      output: { entryFileNames: '[name].cjs', format: 'cjs' },
    },
  },
});
