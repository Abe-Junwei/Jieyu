---
title: CSS 浏览器兼容矩阵
doc_type: architecture-spec
status: active
owner: repo
last_reviewed: 2026-04-08
source_of_truth: css-compat-governance
---

# CSS 浏览器兼容矩阵

## 支持策略总览

| 特性 | 策略 | 说明 |
| --- | --- | --- |
| `color-mix()` | 渐进增强 | 老环境忽略后回退到变量/基础色，不阻断核心交互 |
| `field-sizing: content` | 渐进增强 | 不支持时回退到常规输入框尺寸 |
| `backdrop-filter` | 必须降级 | 需要 `@supports not (...)` 提供非模糊替代样式 |

## 验证入口

- 兼容性策略一致性：`npm run check:css-compat`
- 样式规则约束：`npm run lint:css`
- 构建体积门禁：`npm run check:build-budgets`

## 维护约定

1. 新增 CSS 现代特性时，需先更新 `scripts/css-browser-support-matrix.json`。
2. 若策略为“必须降级”，必须在样式中补 `@supports` 分支后再合入。
3. 每次季度发布前复核一次矩阵与脚本输出，避免策略漂移。
