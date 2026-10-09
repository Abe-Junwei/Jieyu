/**
 * 浏览器：`index.html` 中先于 `main.tsx` 的独立 module 入口（勿并入 main，见 ADR 0021）。
 * Vitest：`vite.config.ts` → `setupFiles` 首项。
 *
 * Browser: standalone module entry in `index.html` before `main.tsx` (do not merge into main; ADR 0021).
 * Vitest: first `setupFiles` entry in `vite.config.ts`.
 *
 * 不 import zod：Zod 4 从 `globalThis.__zod_globalConfig` 取全局配置，这里抢先写入即可。若 import zod，
 * 打包后会先执行装着 zod 的业务 chunk，其中顶层 schema 在 jitless 生效前就构造并触发 `Function('')` 探测。
 * No zod import: Zod 4 reads its global config from `globalThis.__zod_globalConfig`, so writing it
 * first is enough. Importing zod made the bundle evaluate the chunk that hosts zod (and top-level
 * schemas) before jitless was set, which still fired the `Function('')` eval probe under CSP.
 */
const zodGlobal = globalThis as { __zod_globalConfig?: Record<string, unknown> };
Object.assign((zodGlobal.__zod_globalConfig ??= {}), { jitless: true });
