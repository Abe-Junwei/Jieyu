---
title: annotation-validator-panel requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-25
source_of_truth: annotation-validator-panel-spec
depends_on:
  - ../annotation-morpheme-edit/requirements.md
---

# Requirements — Annotation Validator Panel (B4h)

## 1. What & Why

- **要做什么**：聚焦句段上，把已有 gloss 的结构切段、Leipzig 缩写问题和需复核状态读出来。
- **为什么现在做**：标注路线图 M1 余量只剩更完整的 Validator 面板。模板编辑已在 `/assets/structural-profiles`。
- **不做什么**：不调用确认写入；不改转写文本/时间码；不新建模板表；不接 ChatWindow；不新 flag；不做 M2 typed relation 编辑。

## 2. 用户场景（≤ 3 条）

1. 聚焦句段的 token gloss 为 `dog-PL` 时，面板列出切段，且 `unit_relations` 不增加。
2. gloss 含未闭合的中缀标记时，面板标成需复核，并带出 warning。
3. 句段还没有 gloss 时，面板说明当前没有可检查的 gloss。

## 3. 验收标准（可测）

- [x] `dog-PL` 切段为 dog / PL，readback 后 relation 仍为 0
- [x] `touch<PRS` 标成需复核，且不写 candidate
- [x] 聚焦行渲染结构校验面板；无 gloss 时显示空态

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Helper | `annotationValidatorPanel.ts` | 收集 gloss 并只读预览 |
| Controller | `useAnnotationValidatorPanelController.ts` | 新增 |
| UI | `AnnotationIgtUnitExtras.tsx` / `AnnotationWorkspace.tsx` | 装配面板 |
| i18n | `dictKeys.ts` 与 zh-CN / en-US | 新键 |
| 测试 | `annotationValidatorPanel.test.ts` / `AnnotationPage.test.tsx` | 新增 |

## 5. 已知风险与依赖

- 确认候选会拒绝同句段上的 pending 分析图，包括二次分词快照。本面板不确认。
- 侧栏内容更新不因正文变化刷新，面板放在聚焦行内，不放进 side pane 快照。
