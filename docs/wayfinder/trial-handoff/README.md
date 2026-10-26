# Wayfinder 本地 Markdown 追踪约定

- 每张地图一个目录：`docs/wayfinder/<map>/`，地图本体为 `map.md`（等同 `wayfinder:map` issue）。
- 单子为 `tickets/NNN-<slug>.md`，编号即 id；front matter 字段：
  - `title`（名字，引用时用名字）、`label`（`wayfinder:research|prototype|grilling|task`）、`mode`（HITL/AFK）
  - `status`（open/closed）、`assignee`（认领者，空即未认领）、`blocked_by`（id 列表）
- 阶段门槛用 `execution_gate` 记录（如 M4）；达到阶段须有单库计划中的验收证据，不能以关联 issue 尚未关闭推断未就绪，也不能只因 blocked_by 为空就开工。`outside-m4-whitelist` 表示未获准进入 ADR-0086 白名单，M4 通过后仍不得领取。`remote-sync-only` 表示只待远端同步，不能领取实施。
- 前线 = status open、execution_gate 已通过（若有）、blocked_by 全部已关闭、assignee 为空。`blocked_by` 里的 id 没有本地文件，就是已关闭。
- 解决时：结论写进 GitHub issue 并关闭，在 map.md「Decisions so far」加一行链接，然后删除本地单子（[ADR-0051](../../adr/0051-every-doc-type-has-an-end.md)）。
- 下一程（[#285](https://github.com/Abe-Junwei/Jieyu/issues/285)）的单子开工前只放在 GitHub，开工时再建本地文件。

## 本轮切片与 GitHub 对账

M5-C 起的领取/验收以[单库计划](../../execution/plans/desktop-project-sqlite-2026-10-25.md#可领取切片与交付顺序2026-10-25-本轮重排)为准。M1 至 M5-B 已落地，不关闭 #275。025/#275 追踪 M1–M4 和集成终验，030/#280 追踪 M5 真实领域接替，043/#325 追踪 D1–D4，046/#329 随场景迁移；阶段就绪不同于父 issue 已关闭。005、015 的门槛是 M4；016 是 M6 包 API；039 与 #277 同期（M4）。007 的门槛是 `outside-m4-whitelist`。当前范围写入 issue 顶部，旧正文折叠保留作历史；不自动勾实现或关闭 issue。#311/#333/#299 尚未开工，仍只在 GitHub 跟踪，不为本轮规划提前建本地单子。
