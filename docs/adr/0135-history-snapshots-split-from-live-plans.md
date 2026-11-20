---
title: ADR 0135 - 仍在用的计划可把历史段剥到 docs/history/ 只读快照
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-20
source_of_truth: decision-record
depends_on:
  - ./0049-decisions-not-current-state-inventories.md
  - ./0051-every-doc-type-has-an-end.md
---

# ADR 0135：仍在用的计划可把历史段剥到 docs/history/ 只读快照

## 背景

[主路线图](../execution/plans/解语-主路线图-master-roadmap-2026-06-01.md)到 2026-11-20 已有 802 行。现行排期只在开头的唯一执行队列；后面是 Stage A/B/C 切片清单、已关闭的 Agent 波次和近 300 行修订记录。代理和人每次都要读过这些历史才能找到下一片。

[ADR-0051](./0051-every-doc-type-has-an-end.md) 只给计划一种结束方式：整份完成、放弃或被取代时删除，原文留在 git 历史。主路线图仍在用，不能删。直接删掉历史段又会让「主路线图 §3」之类的引用落空，读者得自己翻 git 历史。治理规则也禁止重建 `docs/execution/archive/`，因为那个目录曾经越积越多、没人清理。

## 决策

1. ADR-0051 第 1 条的类型表加一行：

   | 类型 | 位置 | 何时更新 | 何时结束，怎么处理 |
   | --- | --- | --- | --- |
   | 历史快照 | `docs/history/` | 移入后不再编辑 | 没有任何文件再链接它时删除 |

2. `docs/history/` 只接收从**仍在用的计划**里剥出的历史段。整份结束的计划仍按 ADR-0051 直接删除，不进这里；ADR、规格、合同也不进这里。
3. 快照 frontmatter 必须有 `doc_type: history` 和 `split_from:`。`split_from` 写来源计划在 `docs/execution/plans/` 下的路径，该路径必须存在。来源计划删除时，快照随之删除，或在同一次改动里把仍需要的段落写回某份活文档。
4. 快照原文照搬，章节号沿用原文，只把相对链接改成从新位置可达。移入后不再编辑；与来源计划冲突时以来源计划为准。
5. 「链接」按文件名匹配，`docs/` 下除 `adr/`、`history/` 外的活文档、入口文件、`.cursor/`、`package.json`、`scripts/`、`src/`、`tests/`、`.github/` 里任一处出现都算。`adr/` 决定后不改不删、兄弟快照也是只读，两者不计入保持快照存活的链接。这一点和 ADR-0051 的「点名」不同：快照存在就是为了让旧文档里的引用继续可达，所以活文档互链也算。
6. 快照不做反引号路径检查。它记录的是当时的路径，失效是预期的。

## 检查

`npm run check:docs-governance`：

- 放行 `docs/history/*.md`。
- 缺 `doc_type: history`、缺 `split_from:`，或 `split_from` 不是现存的 `docs/execution/plans/*.md` 计划文件，直接失败。
- 除 `docs/adr/` 与 `docs/history/` 外没有任何文件链接某份快照时失败，要求删除。
- 「移入后不再编辑」只写在本 ADR，不做检查。按 diff 拦截编辑的误报太多，比如改链接路径也会被拦下。

## 修订

- [ADR-0051](./0051-every-doc-type-has-an-end.md) 第 1 条类型表：新增「历史快照」一行，见决策第 1 条。其余条款不变。
- 首个快照：主路线图的旧 §2 切片总览、§2.2.1–2.2.4、§3 切片清单和旧 §6 修订记录，移到 `docs/history/解语-主路线图-历史-2026-06-01至2026-11-20.md`。主路线图保留执行队列、社区需求统筹、首发范围增补、§1、§2.1、§2.2.0 和 §4，原章节号不变。

## 被放弃的备选方案

1. 历史段直接删，引用改成指向瘦身前提交的 GitHub 永久链接。最符合 ADR-0051，但读者要离开仓库才能看到；引用处也得写一串提交哈希。
2. 快照留在 `docs/execution/plans/`，用 `active` 状态标为历史参考。计划状态会失去意义，代理也会把它当排期读。
3. 恢复 `docs/execution/archive/`。那个目录没有结束规则，曾经越积越多。
4. 用 git diff 拦截对快照的编辑。理由见「检查」最后一条。
