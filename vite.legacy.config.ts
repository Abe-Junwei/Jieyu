import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJieyuViteConfig } from './vite.shared.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

export default createJieyuViteConfig({
  html: 'legacy/index.html',
  outDir: 'dist-legacy',
  pwa: true,
  root: 'legacy',
  publicDir: resolve(repoRoot, 'public'),
  legacySurface: true,
});
