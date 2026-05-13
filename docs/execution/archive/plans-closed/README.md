---
title: archive/plans-closed 文档索引
doc_type: execution-archive-index
status: active
owner: repo
last_reviewed: 2026-05-13
source_of_truth: plans-closed-archive
---

# archive/plans-closed

新增的已收口（`status: done` / `completed` / `superseded`）执行计划归入此目录。

## 与 `docs/execution/plans/` 的关系

- `docs/execution/plans/` 中既存的 closed plans **不强制迁移**：它们可能被外部 docs 通过稳定路径深链。`frontmatter` 中的 `status` 字段是收口状态的 SSoT，自动生成的 `plans/README.md` 索引会按 `status` 过滤展示。
- **本目录用于新增**：从 2026-05-13 起，新创建并很快收口的 plans 优先放入本目录；同期收口的，作者判断是否安全移入。
- 守卫脚本：`npm run check:plans-frontmatter` 验证两侧 frontmatter 一致性。

## 现有内容

> 目前为空目录（仅 README）。

## 历史档案的其它去处

- 占位页 / superseded AI 智能体计划：`../planning-ai-agent-superseded/`
- 里程碑执行记录：`../milestone-records/`
- 阶段总结：`../phase-summaries/`
- Cursor / Kimi / Claude 工具内部 plan 文件历史导出：`../cursor-plans/` / `../kimi-plans/` / `../claude-plans/`
