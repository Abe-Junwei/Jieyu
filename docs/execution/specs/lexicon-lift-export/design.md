---
title: lexicon-lift-export design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-20
source_of_truth: lexicon-lift-export-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon LIFT Export

## 1. 成熟方案扫描 / Research

- 仓库既有：转写 `FlexService.exportToFlextext` 是 **IGT interlinear**，不是词库；C3c `transcriptionIgtLatexExport` 只出站、空列表不 download；语料 B5b/c 剪贴板/bundle 与词典包 **分入口**（R5）；`saveLexiconEntry` 已有 nested sense/form `id`。
- 同类产品：FLEx / WeSay / Lexique Pro / The Combine / Dictionary App Builder 用 LIFT 交换词库。FLEx *Technical Notes*（Zook 2026-02-10）：程序仍用 **0.13**；0.15 未普及。
- 业内：SIL [lift-standard](https://github.com/sillsdev/lift-standard) RNG + `lift_13.pdf`。`lexical-unit/form[@lang]/text`；`sense/gloss`；`definition/form`；**allomorph = entry `<variant>`**；跨条 variant 才是 `_component-lexeme`。权威实现是 **.NET LiftIO**，浏览器侧无维护中的 0.13 exporter（不引入 C#/Python 桥）。
- 公认不可行：从 `/corpus` 导出词典包；把 lexeme 塞进 flextext phrase；一次做 LIFT 导入；上 DMLex 1.0；为 form 输出独立 LIFT id（规范无此字段）；npm 拉未维护 lift 包。
- 潜在的坑：`lang` 重复被 RNG 拒；`default` 不是 BCP 47；空 lemma 出空 `lexical-unit`；附件路径相对 FLEx `LinkedFiles`（本切片不做）。
- 决定：**适配** LIFT 0.13 最小子集；**复用** 已有 lexeme JSON + nested id；**自研** 小型 XML 序列化（与 FlexService 同款 `escapeXml`，不抽公共层）。`producer="Jieyu"`。无新依赖。

## 2. 架构选择

- 落位：`derived`（XML）+ `actions`（download）
- 选 A：`src/utils/lexiconLiftExport.ts` + 页面按钮
- 拒绝：新 Mega-hook；接到 `useImportExport` / 转写项目中心；Corpus 菜单加 LIFT

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/utils/lexiconLiftExport.ts` | 序列化 + download | < 220 |
| `LexiconPage.tsx` | 按钮绑定 | +20 |
| i18n 三文件 | 导出文案 | 增量 |

约束自查：无 `src/features/`；无新 hook；无第三层 border。

## 4. ADR 引用

- 无新 ADR。出站格式可逆。词库仍不同步协作（ADR-0034）。

## 5. Feature flag

- 无。与 C3c / B3c 相同：本地出站，不改 corpus/MCP/附件 flag。

## 6. 失败模式 / 兼容性

- 空列表：按钮 disabled，零 Blob。
- download API 缺失：返回失败文案，不抛到编排层。
- 回滚：删按钮与 helper；词条数据不变。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元 | `npx vitest run src/utils/lexiconLiftExport.test.ts src/pages/LexiconPage.test.tsx` | pass |
| 守卫 | architecture-guard / docs / workflow | OK |
| e2e | `test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts` | 导出按钮可见 |
