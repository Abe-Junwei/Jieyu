---
title: ADR 0021 — Zod jitless 与严格 CSP
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-25
source_of_truth: architecture-decision
---

# ADR 0021：在严格 `script-src` 下启用 Zod `jitless`

## 背景

- 生产 `index.html` 使用 **`script-src 'self' 'wasm-unsafe-eval'`**， intentionally **不包含** `'unsafe-eval'`。
- Zod v4 默认 JIT 路径会通过 **`new Function("")` 探测** 当前环境是否允许动态代码生成；在 Firefox 等引擎下，该探测会触发 **CSP 控制台/遥测层面的「eval 被拦」报告**，即使用 `try/catch` 包裹亦然。
- 解语在客户端大量使用 Zod（含随 `linguistic-core-runtime` 等 chunk 打包的 schema），若不处理，会与「严格 CSP」产品目标冲突。

## 决策

1. **`src/zodJitlessBootstrap.ts`**：仅从 **`zod/v4/core/core.js`**（Vite `resolve.alias` → `node_modules/zod/v4/core/core.js`）导入 `globalConfig` 并 `Object.assign(globalConfig, { jitless: true })`。**禁止**仅在 `main.tsx` 内 `import { config } from 'zod'` 再设置。
2. **Vite 生产**：默认会把 `index.html` 里多段 `type="module"` 与 `main` **打成单 chunk**，静态 `import` 仍先于同 chunk 内任何「后置」逻辑，故仅靠「在 HTML 里先于 main 写另一段 `<script type="module" src=…bootstrap>`」**不可靠**。采用 **`build.rollupOptions.input.zodJitlessBootstrap`** 产出固定名 **`assets/zod-jitless-bootstrap.js`**（`output.entryFileNames`），并由插件 **`injectZodBootstrapExecBeforeMain`** 在 **`transformIndexHtml`（`order: 'post'`）** 于 **`main-*.js` 之前**插入可执行的 `<script type="module" src="/assets/zod-jitless-bootstrap.js">`。**开发**：同一插件在 `ctx.server` 下于 `/src/main.tsx` 之前插入 `/src/zodJitlessBootstrap.ts`。
3. **Vitest**：`vite.config.ts` → `setupFiles` 首项为 `src/zodJitlessBootstrap.ts`。
4. **`manualChunks`**：将 **`node_modules/zod/**` 归入 `zod-vendor`**，避免业务异步 chunk 再打进第二份 Zod 与第二份 `globalConfig`。
5. 当 `globalConfig.jitless === true` 时，Zod 对象解析路径 **`jit` 为 false**，`fastEnabled = jit && allowsEval.value` 短路，**不会**读取 `allowsEval`，从而避免 `Function` 构造器探测（见 `node_modules/zod/v4/core/schemas.js`）。
6. **不**通过放宽 CSP（例如整站 `'unsafe-eval'`）解决该问题。

## 影响

- **性能**：关闭 Zod JIT，部分复杂 object schema 校验可能略慢；对当前产品路径可接受，若未来出现可度量热点再评估局部优化或上游变更。
- **安全**：保持严格 `script-src`，降低 XSS 后动态执行面。
- **测试**：E2E 中基于控制台字符串的 CSP 断言在 Firefox/WebKit 上与 Chromium 对齐，无需再过滤「已知噪声」。

## 备选方案（未采纳）

- **`'unsafe-eval'`**：扩大攻击面，与基线安全策略不符。
- **仅文档要求开发者「勿用 JIT」**：不可执行、易回归。
- **补丁 node_modules**：维护成本高；官方亦提供 `config({ jitless: true })`，但本仓库以 **`globalConfig` 抢先写入** 为准（见上文决策），二者择一即可，勿重复假设执行顺序。

## Zod / Vite 大版本或 CSP 相关改动后的回归（本地）

合并前或发版前在干净工作区执行（仓库已提供脚本）：

1. `npm run regression:vite-zod-csp`（即 `typecheck` → `build` → `test:e2e` 三引擎）。
2. 核对 **`dist/index.html`**：存在 **先于** `main-*.js` 的 **`/assets/zod-jitless-bootstrap.js`** 可执行脚本标签，且 **`vite.config.ts`** 中 `injectZodBootstrapExecBeforeMain` 仍作用于 `transformIndexHtml` **post**。
3. 若升级 **Vite**：重点确认多入口 `rollupOptions.input` 与 `output.entryFileNames` 行为未变；若升级 **Zod**：确认 `globalConfig` / `jitless` 语义与 `zod/v4/core/core.js` 路径仍有效。

## 回顾点

- 升级 **Zod 大版本** 或 **Vite 大版本** 后复核：`jitless` 语义、`setupFiles`、`rollupOptions.input` / `entryFileNames` 与 **`transformIndexHtml` post 注入**是否仍保证「先于 `main` 执行」。
- 若引入 **第二份 Zod 实例**（重复打包），需确保每实例均 `jitless`，或收敛 dedupe。
