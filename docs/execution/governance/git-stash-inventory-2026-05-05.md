---
title: Git stash 台账快照（2026-05-05）
doc_type: execution-governance-ledger
status: active
owner: repo
last_reviewed: 2026-05-05
source_of_truth: stash-inventory
---

# Git stash 台账快照（2026-05-05）

> 由代理执行「清暂存 / 盘点」时生成：**不自动 `stash drop`**，避免误删。回收请在干净工作区上逐条 `git stash apply` / `git stash pop` 并解决冲突。

| 索引 | 摘要 | 建议 |
| --- | --- | --- |
| `stash@{0}` | `wip-audit-ndjson-agent-evals`（feat 分支） | 若仍需 NDJSON / agent-evals 产物：在目标分支 `git stash apply stash@{0}` |
| `stash@{1}` | `temp: pre-commit blockers (adapter etc.)` | 仅当确认已过时再 `drop`；否则先 `show` 再决定 |
| `stash@{2}` | `wip: i18n split + B-5 main` | 独立 PR 时取出 |
| `stash@{3}` | `temp: agent gate wiring` | 核对是否已被主线替代 |
| `stash@{4}` | `wip: local before stash recovery 20260424-1642` | 历史本地快照；谨慎处理 |
| `stash@{5}` | `pre-switch-to-main after PR merges`（chore 分支） | 与旧分支相关；确认无未合并改动再 drop |
| `stash@{6}` | `autostash` | **体量较大**（含 CI/docs/scripts 等）；**勿盲删**。若确认与主线重复，可人工比对后 `git stash drop stash@{6}` |

刷新列表：`git stash list`。本条目不随 stash 变化自动更新。
