---
title: ADR 0051 - 每类文档都有结束规则
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
---

# ADR 0051：每类文档都有结束规则

## 状态

accepted。补充 [ADR-0049](./0049-decisions-not-current-state-inventories.md)，不取代它。

## 背景

ADR-0049 定了文档放哪里，以及完成的计划离开工作区。规格落地后要删、合同不再被点名要删，这些规则写在入口里，但没有检查。结果是已经勾完的规格、没人引用的门禁和台账、已关闭的试用单都还留着，合同里的代码路径失效了也没人发现。

业内做法一致：文档和代码在同一次改动里更新，死文档直接删、需要时从历史找回（Google 文档准则）；文档带负责人和复审日期，过期提醒（*Software Engineering at Google* 第 10 章）。CI 只能核对链接、路径、复审日期这类事实，判断不了一句话真不真。代理入口文件里的路径失效很常见，用 git 核对路径是否存在就能抓到（*Context Rot*，arXiv 2606.09090）。

## 决策

1. `docs/` 下每个文件都属于下表的一类。放在表外位置的文件，检查直接失败。

   | 类型 | 位置 | 何时更新 | 何时结束，怎么处理 |
   | --- | --- | --- | --- |
   | ADR | `docs/adr/` | 决定不改 | 被新 ADR 取代时改为 superseded，不删 |
   | 计划 | `docs/execution/plans/` | 排期或范围变了 | 完成、放弃或被取代时删除。搁置的写 `revisit_when:` |
   | 规格三件套 | `docs/execution/specs/<slug>/` | 实现过程中 | 任务全部勾完就删除 |
   | 合同与指南 | `docs/architecture/`、`docs/development/` | 引用的代码或命令改了 | 入口文件、代码、测试、脚本都不再点名它时删除 |
   | 门禁与台账 | `docs/execution/release-gates/`、`docs/execution/governance/` | 门槛或例外变了 | 入口文件、代码、测试、脚本都不再点名它时删除 |
   | 机器导出 | `docs/execution/audits/`、`release-evidence/` | 由脚本生成 | 只放脚本生成的文件和一份目录说明；没有脚本再读写就删除 |
   | 试用地图与单 | `docs/wayfinder/<map>/` | 有拍板 | 单关闭后结论写进 GitHub issue 和地图 Decisions，删除本地文件 |
   | 目录说明 | 各目录 `README.md` | 目录内容变了 | 随目录删除 |

   「点名」只算入口文件（`README.md`、`AGENTS.md`、`AI_QUICKSTART.md`、`copilot-instructions.md`、PR 模板）、`.cursor/`、`package.json`、`scripts/`、`src/`、`tests/`、`.github/`。其他文档和目录说明互相链接不算。

2. 文档和它引用的代码在同一次改动里更新。入口文件、规则和合同里用反引号写的路径必须存在，失效就失败。计划和试用单里失效只报告。禁令和删除说明里提到的已删路径不算失效。
3. 合同、指南和入口文件带 `last_reviewed`。超过 90 天警告，超过 180 天失败。复审要对照代码，不只改日期。
4. 改了被文档引用的代码、却没改那份文档时，Cursor 停止钩子只提醒，不拦截。很多代码改动本来就不需要改文档，硬拦只会换来凑数的修改。

## 影响

- 这些规则由 `npm run check:docs-governance` 在 CI 里执行，它同时跑计划状态检查和复审日期检查。
- 已删除文件的原文在 git 历史里，需要时找回。

## 被放弃的备选方案

1. 已完成的计划和关闭的单改状态后留在目录里。目录会越积越多，代理照样会读。
2. 写一个脚本判断散文是否属实。检查做不到，只会制造误报。
3. 改代码却没改文档时硬拦。理由见决策第 4 条。
