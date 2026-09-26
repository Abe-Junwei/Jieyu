---
title: annotation-validator-panel design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-25
source_of_truth: annotation-validator-panel-spec
depends_on:
  - ./requirements.md
---

# Design — Annotation Validator Panel (B4h)

## 1. 成熟方案扫描 / Research

- 仓库既有：`previewAnnotationStructuralCandidate` 只读调用 `LinguisticStructuralProfileService.previewStructuralRuleProfile`。`/assets/structural-profiles` 的沙盒负责模板启停、导入导出和确认前预览。标注页已有 Leipzig 行内波浪线，侧栏只显示模板 id 和跳转链接。`confirmAnnotationStructuralCandidate` 会 `submitAnalysisGraphCandidate`，并拒绝同句段其他 pending 候选。
- 同类产品：FLEx 把解析问题放在行间文本旁的只读提示，模板在 Grammar 区维护。ELAN 没有 Leipzig 校验面板。
- 业内：Leipzig Glossing Rules 是展示约定。标注页消费解析结果，不在同一屏再做一套模板编辑器。
- 公认不可行：在标注页再确认一条分析图；复制结构模板 CRUD；把 M2 的 typed relation 编辑塞进这个面板。
- 潜在的坑：侧栏注册只在 title/subtitle 变化时通知外壳，异步预览结果放进 side pane 不会刷新。
- 决定：**复用** 已有只读 preview。聚焦行列出切段、warning 和 Leipzig 缩写问题。不调用 confirm。模板编辑仍留在结构标注配置页。无新 flag、无新表。

## 2. 架构选择

- 落位：纯函数收集 gloss；新 controller 只做 query；页面把结果传给聚焦行
- 拒绝：写 `unit_relations`；在 morphology controller 上再加 hook；给面板加第三层边框

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `annotationValidatorPanel.ts` | 收集显示中的 gloss，调用只读 preview |
| `useAnnotationValidatorPanelController.ts` | 按聚焦句段查询 |
| `AnnotationIgtUnitExtras.tsx` | 渲染面板 |
| `AnnotationWorkspace.tsx` | 装配 |

## 4. ADR 引用

- ADR-0022：自动分析先是候选。本切片连候选也不写。
- 新建 ADR：否

## 5. 验证

- `npx vitest run src/pages/annotation/annotationValidatorPanel.test.ts src/pages/AnnotationPage.test.tsx`
- `npm run typecheck`
- `npm run check:architecture-guard`
- `npm run check:docs-governance`
