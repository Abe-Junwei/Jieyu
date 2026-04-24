/**
 * 浏览器：`index.html` 中先于 `main.tsx` 的独立 module 入口（勿并入 main，见 ADR 0021）。
 * Vitest：`vite.config.ts` → `setupFiles` 首项。
 *
 * Browser: standalone module entry in `index.html` before `main.tsx` (do not merge into main; ADR 0021).
 * Vitest: first `setupFiles` entry in `vite.config.ts`.
 */
import { globalConfig } from 'zod/v4/core/core.js';

Object.assign(globalConfig, { jitless: true });
