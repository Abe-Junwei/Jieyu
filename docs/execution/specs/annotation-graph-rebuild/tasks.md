---
title: annotation-graph-rebuild tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-25
source_of_truth: annotation-graph-rebuild-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — R1 合同与模型实验

## 本轮交付

- [x] 追踪人工、导入、候选入口到实际写入与读回，核对旧快照机制。
- [x] 写逐字段归属表，分清真值、显示、线性投影和独立备注。
- [x] 独立实验复现当前显示路径的映射丢失；验证完整载荷 JSON 往返。
- [x] 覆盖非连续词素、多语映射、来源、链接/备注稳定 id 和局部修改。
- [x] 覆盖错误载荷、词义身份、缺失父关系和跨语段 id 冲突。
- [x] 起决定草案，仅说明完整载荷和身份的取舍；不改 0088 正文。

## 生产实施前（本轮不实施）

- [ ] 确认第 7 节字段合同；R1 从“已有证据”变为“已接受合同”才可关闭。合同确认前不实现共同提交入口。
- [ ] R1 字段合同确认后，按 ADR-0089 实现一个提交入口：主进程读完整状态、核对预期版本、应用操作、校验、同步投影和词义索引、事务内读回。该入口不包含 R5 文件协议和 R6 逐列清单。
- [ ] 人工编辑、导入、候选接受逐一改接该入口。导入未提供的内容保留。调用方不再拥有绕过图的词项写入。
- [ ] 同一合成材料分别走三条入口，关闭重开后语言内容和关联一致，来源按入口保留。现有往返实验不代替这项。
- [ ] 确定显示镜像的标识与刷新规则；完整多语载荷是唯一编辑入口，复杂语义关系不被重建覆盖。
- [ ] 提升实验编解码为生产领域校验/投影，补类型穷尽与非法输入；不直接 import 测试辅助函数。
- [ ] 新节点分配 id 并映射边/跨度/关联；补真实重导入身份和跨度正字法上下文验收。
- [ ] A1/A2 真实 SQLite 写入→关闭→重开与中途失败通过后，再记录领域接替完成。

## 检查

- [x] 定向实验及关联 annotation/import/retokenize 回归：6 文件、45 项通过（含 6 项 R1 实验）。
- [x] npm run typecheck；npm run check:architecture-guard 通过（既有热点警告保留）。
- [x] npm run check:agent-evals:smoke 4/4；npm run check:dev-agent-workflow-verify 通过。
- [x] npm run check:docs-governance；git diff --check 通过（历史路径及计划文件警告保留）。
- [ ] 生产接替与合同任务全完成后按 ADR-0051 删除本规格；决定与验证证据保留。
