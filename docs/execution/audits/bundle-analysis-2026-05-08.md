---
title: Bundle 体积分析报告（2026-05-08）
doc_type: execution-audit
status: active
owner: repo
last_reviewed: 2026-05-08
source_of_truth: bundle-analysis
---

# Bundle 体积分析报告（2026-05-08）

## 1. 现状快照

基于 `npm run build`（Vite + Rollup）产物分析：

| Chunk | 原始大小 | Gzip | 说明 |
|-------|---------|------|------|
| `language-mapping-runtime` | **1,054 KB** | 104 KB | 超标 chunk，根因见 §2 |
| `map-vendor` | 1,030 KB | 273 KB | Leaflet / mapbox-gl 等地图库 |
| `pdf-vendor` | 869 KB | 261 KB | PDF.js 及其依赖 |
| `main` | 251 KB | 73 KB | 入口 chunk |
| `language-iso-database` | 9.3 KB | 1.3 KB | `iso-639-3` + `iso6393Seed.ts` |
| `language-display-runtime` | 7.5 KB | 2.7 KB | `languageNameCatalog` + `languageCatalogRuntimeCache` |

> **阈值参考**：仓库构建预算对单个 chunk 的未压缩大小警戒线为 400 KB。`language-mapping-runtime` 超出约 2.6 倍。

## 2. 根因分析

### 2.1 直接原因

`language-mapping-runtime` 的 1.05 MB 中，**~1.01 MB 来自 `language-subtag-registry` 的 JSON 注册表数据**。源文件体积对比：

- `node_modules/language-subtag-registry/data/json/registry.json`：**1,112 KB**
- `language-mapping-runtime-BZvsrq3h.js`：**1,054 KB**

两者高度吻合，说明 registry JSON 被完整内联到了 `language-mapping-runtime` chunk 中。

### 2.2 代码路径

`src/utils/langMapping.ts` 第 10 行：

```ts
import languageTags from 'language-tags';
```

`language-tags/lib/index.js` 以 `with { type: 'json' }` 静态导入：

```js
import registry from 'language-subtag-registry/data/json/registry.json' with { type: 'json' };
```

`langMapping.ts` 中实际调用 `languageTags` API 的位置仅有两处：

1. `buildLanguageMapping()`（第 423、427 行）：`languageTags.language()` / `languageTags.type()` / `languageTags.languages()`
2. `getLanguageCatalogByCode()`（第 458 行）：`languageTags.language()` / `languageTags.type()`

这两个函数均**非首屏热路径**（`buildLanguageMapping` 在模块初始化时执行一次；`getLanguageCatalogByCode` 在语言选择交互时调用）。

### 2.3 `manualChunks` 失效原因

`vite.config.ts` 中已配置：

```ts
if (
  id.includes('/node_modules/language-subtag-registry/')
  || id.includes('/node_modules/language-tags/')
) {
  return 'language-subtag-registry';
}
```

但构建产物中**不存在 `language-subtag-registry-*.js` 文件**。初步判断失效原因是：

- Vite 对 `with { type: 'json' }` 的 JSON import 处理路径与常规 JS module 不同，可能不经过 `manualChunks(id)` 的 id 匹配；
- 或者 `language-tags` 与 `language-subtag-registry` 被 Rollup 的 chunk 合并策略判定为「不可拆分」（因 `language-tags` 同步且无条件地依赖 registry JSON）。

无论哪种原因，**静态 import 导致 registry 数据与 `langMapping.ts` 逻辑被强制打包到同一 chunk**。

## 3. 影响评估

| 维度 | 影响 |
|------|------|
| 首屏加载 | `langMapping.ts` 被 `VoiceAgentWidget`、`ProjectSetupDialog`、`LanguageIsoInput` 等组件导入，部分可能在首屏或早期交互中加载；1.05 MB 的同步加载会阻塞这些组件的首次渲染 |
| 缓存效率 | `language-mapping-runtime` 随业务代码频繁变化，大体积导致缓存失效成本高 |
| 网络传输 | gzip 后 104 KB 尚可接受，但在慢网或移动环境下仍为明显负担 |

## 4. 可选方案

### 方案 A：动态导入（推荐）

将 `language-tags` 的调用改为异步边界：

```ts
// langMapping.ts
let languageTags: typeof import('language-tags') | undefined;

async function getLanguageTags() {
  if (!languageTags) {
    languageTags = await import('language-tags');
  }
  return languageTags;
}
```

然后在 `buildLanguageMapping()` 和 `getLanguageCatalogByCode()` 中使用 `await getLanguageTags()`。

**优点**：
- 首屏不携带 1 MB registry 数据
- 只在用户实际触发语言相关功能时加载
- 改动范围小，仅影响两个函数

**缺点**：
- `buildLanguageMapping` 当前在模块顶层同步执行，需改为异步初始化或延迟执行
- 调用方需适配 `await`（如 `SUPPORTED_VOICE_LANGS` 等常量不受影响，但 catalog 构建需调整）

### 方案 B：修复 `manualChunks` 强制拆分

尝试通过 `manualChunks` 或 `rollupOptions.output.manualChunks` 的函数逻辑，强制将 JSON 文件拆出为独立 chunk。

**挑战**：
- Vite 对 JSON import 的 chunking 行为不够透明，可能需要编写自定义 Rollup 插件
- 即使拆分成功，`language-mapping-runtime` 仍会在首次加载时同时请求两个 chunk，网络收益有限

### 方案 C：替换 `language-tags`

`language-tags` 的 registry 数据是完整的 IANA 注册表（~8,000 条记录），但 `langMapping.ts` 实际只用到了：
- `languageTags.language(code)` —— 查询语言子标签
- `languageTags.type(code, 'extlang')` —— 查询扩展语言子标签
- `languageTags.languages(macroCode)` —— 查询宏观语言成员

这些功能可以用更轻量的替代方案实现：
- 只提取需要的 ISO 639-3 ↔ BCP-47 映射和宏观语言关系
- 使用已有的 `iso6393Seed.ts` 和 `languageNameCatalog.ts` 数据

**优点**：彻底消除 1 MB 依赖
**缺点**：需要重新实现 `languageTags.languages()` 的宏观语言查询逻辑；测试覆盖成本高

## 5. 建议决策

| 优先级 | 方案 | 排期 | 预期收益 |
|--------|------|------|---------|
| P1 | **方案 A（动态导入）** | W2–W3 | 首屏减少 ~1 MB 同步加载，language 功能首次调用时异步加载 |
| P2 | **方案 C（替换依赖）** | W4+ | 彻底移除 1 MB 依赖，长期最优；需评估实现成本 |
| 观察 | **方案 B（manualChunks 修复）** | — | 若方案 A 实施后发现 chunk 仍过大，再尝试强制拆分 |

## 6. 已完成的立即收益

- **G2-D**：删除死代码 `scripts/build-language-tag-mappings.mjs`（78,675 行），仓库减负但无 bundle 收益（该文件从未被生产代码 import）
- **生成脚本更新**：`generate-language-name-indexes.mjs` 直接输出 JSON，不再生成 `.ts` 内联数据文件

## 7. 验收标准

- [ ] 实施动态导入后，`language-mapping-runtime` 原始大小降至 < 100 KB（仅保留 `langMapping.ts` 逻辑）
- [ ] 首屏 Network 请求中不再出现 `language-subtag-registry` 相关数据同步加载
- [ ] `npm run typecheck` + `npm run build` + `npm test` 全量通过
- [ ] 语言选择、语音语言列表等功能在懒加载后行为一致
