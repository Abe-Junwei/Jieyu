---
title: desktop-lexicon-complete-editor tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-lexicon-complete-editor-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — desktop-lexicon-complete-editor

> 切片 3 开工前再拆；当前仅 Research／SDD 占位。

- [ ] 字段盘点表对照 `dmlexEntrySchema`／`jieyuLexemeSchema` → 验证：文档勾选
- [ ] 完整编辑壳 flag 默认 false → 验证：featureFlags
- [ ] 义项嵌套增删改 + 重开 → 验证：vitest + Electron
- [ ] 引用迁移／解除 → 验证：失败用例 + 重开
- [x] 不适用：本门阶段不改产品代码
