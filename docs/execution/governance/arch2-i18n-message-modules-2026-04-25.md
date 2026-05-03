---
title: ARCH-2 消息模块与 i18n 治理摘要
doc_type: execution-governance-arch-decision
status: active
owner: repo
last_reviewed: 2026-04-30
source_of_truth: arch2-i18n-message-modules
---

# ARCH-2：双 i18n 体系统一治理摘要

独立 `*Messages.ts` 模块须纳入 **`DICT_KEYS` / 词典 catalog** 主线，避免中英混杂与真源分叉。

## 键与守卫

- 键集：`src/i18n/dictKeys.ts`（`DICT_KEYS`、`DictKey`）；加载入口：`src/i18n/index.ts`（`preloadLocaleDictionary`）。
- 相关守卫：`npm run check:i18n-message-imports`、`npm run check:i18n-hardcoded:guard`、`npm run check:locale-usage`。
- 完成度报告：`npm run report:arch2-i18n-message-modules`。

## 与整改清单的对账

- 落地状态与历史统计口径见 [docs/remediation-plan-2026-04-24.md](../../remediation-plan-2026-04-24.md) **§3.2**（ARCH-2）。
