---
title: desktop-professional-query tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-professional-query-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — desktop-professional-query

> 切片 4 开工前再拆；当前仅 Research／SDD 占位。

- [ ] 选定算子子集并对标 CQP／ANNIS（第二轮 Research）→ 验证：design §1 更新
- [ ] AST + 文本／构建器往返测试 → 验证：vitest
- [ ] 执行器 + 写入互斥锁 → 验证：并发用例
- [ ] Electron 有界跨段命中 UI → 验证：合成项目
- [x] 不适用：本门阶段不改产品代码
