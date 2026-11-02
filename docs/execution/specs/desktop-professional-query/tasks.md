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

> 切片 4 开工前再拆；产品语义按ADR-0100已确认，正式语法和技术设计尚未定稿。

- [x] 按ADR-0100整理JQ1文法／算子审阅稿，区分AQL覆盖与ELAN时间关系→ 验证：design §1 更新
- [ ] AST + 文本／构建器往返测试 → 验证：vitest
- [ ] 执行器 + 跨窗全项目写入锁／5秒取消升级／迟到结果拒收 → 验证：并发用例
- [ ] Electron 有界跨段命中 UI → 验证：合成项目
- [x] 不适用：本门阶段不改产品代码
