---
title: igt-latex-export design
doc_type: execution-spec-design
status: active
owner: transcription
last_reviewed: 2026-09-13
source_of_truth: igt-latex-export-spec
depends_on:
  - ./requirements.md
---

# Design — IGT LaTeX export (C3c)

## 1. 成熟方案扫描 / Research

- 仓库既有：C3a/b `transcriptionLiteExport.ts` + `handleExportLite` + `onExportLite`；Flextext 用 `unit.words` / tokens + 首个翻译层作 phrase `gls`；`LeipzigValidator` 非阻塞缩写检查。`analysisGraph` 的 latex 投影是结构诊断，不是例句导出。
- 同类产品：ELAN 无原生 gb4e；FLEx Interlinear 导出 Word/XML；LaTeX 论文生态用 **gb4e** `\gll` 或 **ExPex** `\gla`/`\glb`。
- 业内：Leipzig Glossing Rules（Comrie / Haspelmath / Bickel 2008）一对一对齐；gb4e `\begin{exe}\ex \gll surface\\ gloss\\ \glt `free'\end{exe}`；空列 `{}`；多词 gloss 用花括号。
- 公认不可行：引入 TeX npm 包编译 PDF；把 IGT 写回 `layer_units`；用 AutoGloss 预览当导出；ExPex 与 gb4e 双默认；把格式塞进 Flextext XML。
- 潜在的坑：gb4e 按空格分列，gloss 含空格必须 `{…}`；`_` `%` `&` 须转义；校验失败不应阻断出站；`useImportExport` 禁止再堆序列化。
- 决定：**适配 gb4e `\gll`**（期刊 IGT 更常见）；**复用** C3a 读模型与 `downloadTranscriptionExportText`、`LeipzigValidator`（测试断言）；**不**默认 ExPex；**不**调 `AutoGlossService.glossUnit`。

## 2. 架构选择

- 落位：`derived`（序列化）+ `actions`（菜单 download）
- 方案 A：`onExportLite('tex')` 复用 C3a 回调链 — **选 A**（少穿 ReadyWorkspace）
- 拒绝：新 `handleExportIgtLatex` 全链透传；把 tex 塞进 `serializeTranscriptionLiteExport(cues)`（cue 已丢逐词对齐）

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `transcriptionIgtLatexExport.ts` | words/morphemes → gb4e；转义；翻译层 `\glt` | < 220 |
| `transcriptionLiteExport.ts` | 增加 `TranscriptionOutboundExportFormat` | +5 |
| `useImportExport.ts` | tex 分支：序列化 + download | +25 |
| `LeftRailProjectHub.tsx` | 菜单项 | +12 |

约束自查：编排层只绑事件；无第 3 层 border；不引入 `src/features/`。

## 4. ADR 引用

- 相关 ADR：无（出站格式，可逆）
- 新建 ADR：否

## 5. Feature flag

- 不新增。与 C3a/b 同为转写出站。

## 6. 失败模式 / 兼容性

- 空语段：不 download、不 `done`
- gloss 非 Leipzig：仍导出；测试用合规样例断言 validator
- 回滚：撤菜单项与 helper，SRT/CSV 不受影响

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/utils/transcriptionIgtLatexExport.test.ts src/hooks/importExport/useImportExport.export.test.tsx src/components/transcription/LeftRailProjectHub.test.tsx` | pass |
| 守卫 | `check:architecture-guard` / docs / workflow | OK |
| E2E | `npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts` | 菜单含 IGT |
