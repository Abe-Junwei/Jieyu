---
title: desktop-query-execution requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-query-execution-spec
---

# Requirements — 查询执行与资源

落实ADR-0100 E08–E10/E14：全项目跨窗锁、确认取消、稳定完整结果、可控正则和容量目标。正式语义源为[查询文法](../desktop-professional-query/design.md)，不在本目录平行定义算子。

- [x] 正则候选/许可/集成代价及执行协议已比较。
- [ ] 包装器版本、打包大小、内存/正确性实测完成后锁定依赖。
- [ ] 复杂度保护初值经8GB基线校准，准确报错且不改产品上限。
- [ ] 单写者/只读/worker取消迟到路径与固定答案集通过真实验收。

实现锚点：projectSession.ts、corpusQuery.ts、DesktopCorpusQueryPanel.tsx；拟projectCoordinator.ts、corpusQueryWorker.ts。具体落位在实施Plan确认，任务全完成删除目录。
