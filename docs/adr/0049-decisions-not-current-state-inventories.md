---
title: ADR 0049 - 文档只记决定，不记第二份现状
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
---

# ADR 0049：文档只记决定，不记第二份现状

## 状态

accepted。取代 [ADR-0001](./0001-当前事实统一收口到-architecture.md)。

格式沿用本目录的「背景 / 决策 / 影响 / 被放弃的备选方案」。状态只使用 accepted 或 superseded（Michael Nygard, *Documenting Architecture Decisions*, 2011）。

## 背景

ADR-0001 把长期事实全部放进 `docs/architecture/`，并允许目录变大后再拆子目录。代理随后把代码清单、开关默认值和行数再抄进散文。检查脚本不核对这些句子，代理仍把它们当现状。

## 决策

1. README 仍只保留启动、测试、构建、主要入口和文档索引。已完成、被替换或明确不做的规划不留在工作区，git 历史是原文。不重建 `docs/execution/archive/`。
2. 产品形状只写 `docs/architecture/仓库现状与代码地图.md` 一页。不在 `docs/architecture/` 再写第二份现状盘点，也不为了容纳增长去拆子目录。
3. 该目录里其余页只在 `AI_QUICKSTART.md`、代码注释或会失败的检查点名加载条件时保留。它们是合同，不是清单。
4. 已接受 ADR 的决策正文不改。决定变了就新写一篇，把旧篇 `status` 改为 `superseded` 并链到新篇。
5. 状态只用 `accepted` 或 `superseded`。不再用 `active`。
6. 编号沿主序列四位数递增，不复用。0007 与 0010–0017 空着，不补。0048 留给存储接口（GitHub #274），本篇不用它。文件名以 `adr-` 开头、自称 ADR-001–007 的那一组序列关闭，新决定不排进去。两个 0005、两个 0022 不改名；引用时写文件名。
7. flag 默认值、schema 版本和行数写在代码和检查输出里，不写进 ADR 或 architecture 散文。

## 影响

- 能核对的事实以代码和当次检查为准。产品形状只看那一页。为什么看本目录里状态为 accepted 的记录。
- 目录索引只列链接和状态，不复述每篇决策。

## 被放弃的备选方案

1. 改写 ADR-0001 的决策正文。
2. 为撞号或中文文件名集体重命名。
3. 删掉已被取代的 ADR。0043 留在目录里。0010–0017 是已取消写作工作台的草案，删除时已经空号，不补回。
