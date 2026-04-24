---
title: PWA / 离线壳与首次访问预期
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-04-24
source_of_truth: pwa-offline-ux-boundary
---

# PWA / 离线壳与首次访问预期（C-3）

对应勘误表 **Phase C-3**：在 `vite-plugin-pwa` + Workbox **precache** 尚未把应用壳与关键静态资源写入缓存之前，用户可能遇到以下情况；**这不视为「PWA 坏了」**，而是首次冷启动与 SW 生命周期的正常边界。

## 用户可见行为

1. **首次访问或硬刷新**：浏览器仍在下载主文档与 JS；若网络慢，白屏或骨架时间可能长于二次访问。
2. **Service Worker 首次安装**：安装完成后通常需 **下一次导航** 才由 SW 全面接管；在安装完成前，部分资源仍走网络。
3. **严格 CSP / 大体积资源**：被 `globIgnores` 排除的 WASM、模型、外链字体等 **不会** 进入 precache；离线时这些能力按设计不可用，应回退到「需联网」提示（由具体功能负责）。
4. **开发模式**：默认 **不** 启用 SW（避免与 HMR 冲突）；需本地验证 SW 时使用 `DEV_PWA=1 npm run dev`（见 `vite.config.ts` 注释与 `CONTRIBUTING.md`）。

## 与产品文案的关系

对外说明（帮助页 / 田野工作指南）应写清：**「离线可用」指壳层与已 precache 的转写主路径在 SW 生效后可用**，而非整包 AI / 声学模型在无网时仍可用。

## 相关实现锚点

- `vite.config.ts`：`VitePWA` `workbox`、`navigateFallback`、`globIgnores`、`maximumFileSizeToCacheInBytes`
- `docs/execution/audits/工程审计勘误与全面修复计划-2026-04-24.md` Phase C-1 / C-2
