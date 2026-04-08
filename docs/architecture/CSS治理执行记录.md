---
title: CSS治理执行记录
doc_type: architecture-log
status: active
owner: repo
last_reviewed: 2026-04-08
source_of_truth: css-governance-execution-log
---

# CSS治理执行记录

用于记录 CSS 治理的固定节奏执行证据：预算复盘、兼容矩阵复核、视觉基线更新与废弃窗口推进。

## 记录模板

1. 日期
2. 执行人
3. 执行命令
4. 关键结果
5. 发现问题
6. 下一轮动作

## 2026-04-08 首次记录

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run lint:css`
   - `npm run check:css-architecture`
   - `npm run check:css-a11y`
   - `npm run check:css-compat`
   - `npm run check:css-naming-convention`
   - `npm run check:css-unused-selectors`
   - `npm run check:css-deprecation-window`
   - `npm run test:visual-css`
   - `npm run check:build-budgets`
3. 关键结果：
   - 命名豁免已清零（`panelFilesWithoutPnlRoot=0`）。
   - 废弃窗口机制开始实操（4个历史根类登记）。
   - 视觉基线与兼容矩阵校验通过。
4. 发现问题：
   - 未使用选择器仍存在存量，需要按季度燃尽。
5. 下一轮动作：
   - 2026-Q2 内完成 AST unused 统计净下降目标。
   - 2026-Q2 内完成首批历史根类移除前的兼容替换。
