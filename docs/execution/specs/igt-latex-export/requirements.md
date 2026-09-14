---
title: igt-latex-export requirements
doc_type: execution-spec-requirements
status: active
owner: transcription
last_reviewed: 2026-09-13
source_of_truth: igt-latex-export-spec
---

# Requirements — IGT LaTeX export (C3c)

## 1. What & Why

- **要做什么**：把当前媒体语段的 token 层 surface / gloss 与句段翻译序列化为 Leipzig `gb4e` `\gll`/`\glt` `.tex`，挂到转写项目中心导出菜单。
- **为什么现在做**：C3a/b 已落地字幕与表格；主路线图 C3c 是下一切片，标注结果需能进论文 IGT。
- **不做什么**：不写回编辑模型；不调用 `AutoGlossService.glossUnit`；不做 ExPex 第二 profile、Word/docx（C3d）、新 EAF 管线、ChatWindow、语料库 HTML bundle。

## 2. 用户场景（≤ 3 条）

1. 研究者在转写页导出 Leipzig IGT (LaTeX)：得到可粘进论文的 `gb4e` 片段。
2. 无当前媒体语段：不下载。
3. 词面含 `_`/`%` 等：导出中已转义，不破坏 TeX。

## 3. 验收标准（可测）

- [ ] golden：`\begin{exe}` + `\gll` 两行 token 数一致 + 可选 `\glt`
- [ ] 空语段列表不调用 download
- [ ] 标准 gloss 经 `LeipzigValidator.validateGloss` 通过
- [ ] 菜单项 + i18n；`onExportLite('tex')`；不改 SRT/CSV 行为
- [ ] 不接 ChatWindow；无新 feature flag

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Helper | `src/utils/transcriptionIgtLatexExport.ts` | 新增序列化 |
| Hook | `useImportExport.ts` | `handleExportLite` 增加 `tex` |
| UI | `LeftRailProjectHub.tsx` | 菜单项 |
| Types / telemetry | `intentActionId` / `voiceIntentUi` / callbacks | `toolbarExportTex` |
| i18n | `dictKeys` + zh-CN / en-US | 菜单与完成文案 |
| 测试 | helper + `useImportExport.export` + hub | golden / 下载 / 菜单 |

## 5. 已知风险与依赖

- `useImportExport` 已大：业务只下沉 helper，hook 只读模型 + download。
- 校验非阻塞：用户 gloss 可不标准，仍导出。
- R5：转写 IGT 入口，不混用语料 bundle。
