---
title: i18n 硬编码扫描 — 收敛台账（2026-05-08）
doc_type: execution-governance-ledger
status: active
owner: repo
last_reviewed: 2026-05-08
source_of_truth: i18n-hardcoded-remediation
---

# i18n 硬编码扫描 — 收敛台账（2026-05-08）

## 1. 门禁与基线

- **命令**：`npm run check:i18n-hardcoded:guard`（`--strict` + `scripts/i18n-hardcoded-baseline.json` + `scripts/i18n-hardcoded-thresholds.json`）。
- **基线**：`totalHits` 与 **按文件命中数** 见 `scripts/i18n-hardcoded-baseline.json`；变更语义字符串后若确属预期，运行 `npm run check:i18n-hardcoded:write-baseline` 并在本表 **§4** 登记理由。
- **目录阈值**：`src/ai/` 前缀在 `thresholds.json` 中设 **`maxDelta: 20`**，允许在**不扩写用户可见文案**的前提下做小幅重构（例如拆分 import、移动常量）而不必每次写基线；**净增中文/英文用户文案**仍应走 **dictKeys / `t()`**，不得依赖阈值「堆字」。

## 2. 命中热点（按基线文件）

| 文件 | 基线命中（约） | 性质与收敛策略 |
|------|----------------|----------------|
| `src/ai/chat/localContextToolFormatters.ts` | 高 | 多为双语工具结果模板；**中长期**迁入 i18n 字典或垂直 workflow 专用字典；短期以模块边界测试锁定行为 |
| `src/utils/theme.ts` | 中 | 主题展示名/描述；可分批迁入字典或只读配置 |
| `src/ai/eval/userFeedback.ts` | 低 | 关键词分类启发式；可保留或收紧为枚举映射 |
| `src/hooks/useTranscriptionTimelineVerticalChrome.ts` 等 | 低 | 菜单/aria 片段；与 paired-reading 字典合并优先 |

## 3. 推荐迁移顺序（滚动执行）

1. **用户可见且高频**：`localContextToolFormatters` 中与 UI 同路径展示的句子。
2. **主题/关于页**：`theme.ts` 中品牌化句子。
3. **其余**：按目录阈值内 **delta 最小** 原则随功能 PR 捎带。

## 4. 基线变更记录

| 日期 | 变更 | 执行人 |
|------|------|--------|
| 2026-05-08 | 将 `localContextToolExecutors` / `localContextToolFormatters` 等纳入严格基线；`totalHits` 调至 **216** | 技术债收口 |
| 2026-05-08 | `src/ai/` **maxDelta** 设为 **20**（见 `scripts/i18n-hardcoded-thresholds.json`） | 技术债滚动 |
