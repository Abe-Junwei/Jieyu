---
title: CSS 浏览器兼容矩阵
doc_type: architecture-spec
status: active
owner: repo
last_reviewed: 2026-04-25
source_of_truth: css-compat-governance
---

# CSS 浏览器兼容矩阵

## 与产品级浏览器策略的关系

- 用户可见的「支持哪些浏览器打开应用」以 **[桌面端浏览器支持策略](./桌面端浏览器支持策略.md)** 为准（含 360 / QQ / 搜狗极速模式等条款）。
- 本页仅约束 **CSS 能力** 的渐进增强 / 强制降级与脚本门禁，不替代上页。

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
