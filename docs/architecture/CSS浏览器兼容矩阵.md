---
title: CSS 浏览器兼容矩阵
doc_type: architecture-spec
status: active
owner: repo
last_reviewed: 2026-10-18
source_of_truth: css-compat-governance
---

# CSS 浏览器兼容矩阵

## 与产品交付的关系

- 产品只交付桌面版（[ADR-0063](../adr/0063-desktop-only-after-electron-skeleton.md)）。构建目标是 Electron 44 随附的 Chromium 152（`package.json` 的 `browserslist`）。不对 Chrome、Edge、Firefox、Safari 或国内双核浏览器作支持承诺。
- 本页只约束开发与测试用浏览器构建里的 **CSS 降级** 与脚本门禁。

## 支持策略总览

| 特性 | 策略 | 说明 |
| --- | --- | --- |
| `color-mix()` | 渐进增强 | 老环境忽略后回退到变量/基础色，不阻断核心交互 |
| `field-sizing: content` | 渐进增强 | 不支持时回退到常规输入框尺寸 |
| `backdrop-filter` | 必须降级 | 需要 `@supports not (...)` 提供非模糊替代样式 |

## 验证入口

- 兼容性策略一致性：`npm run check:css-compat`（**按文件**校验：凡出现非 `none` 的 `backdrop-filter` / `-webkit-backdrop-filter`，该文件须含与 `ai-hub.css` 相同的 `@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))` 探针字面量）
- 样式规则约束：`npm run lint:css`
- 构建体积门禁：`npm run check:build-budgets`

## 维护约定

1. 新增 CSS 现代特性时，需先更新 `scripts/css-browser-support-matrix.json`。
2. 若策略为“必须降级”，必须在**同一 CSS 文件**内补 `@supports not`（及通常配套的 `@supports` 正分支）后再合入；勿依赖「别的文件里已有探针」通过门禁。
3. 每次季度发布前复核一次矩阵与脚本输出，避免策略漂移。
