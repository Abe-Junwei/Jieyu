# Wayfinder 本地 Markdown 追踪约定

- 每张地图一个目录：`docs/wayfinder/<map>/`，地图本体为 `map.md`（等同 `wayfinder:map` issue）。
- 单子为 `tickets/NNN-<slug>.md`，编号即 id；front matter 字段：
  - `title`（名字，引用时用名字）、`label`（`wayfinder:research|prototype|grilling|task`）、`mode`（HITL/AFK）
  - `status`（open/closed）、`assignee`（认领者，空即未认领）、`blocked_by`（id 列表）
- 前线 = status open、blocked_by 全部已关闭、assignee 为空。`blocked_by` 里的 id 没有本地文件，就是已关闭。
- 解决时：结论写进 GitHub issue 并关闭，在 map.md「Decisions so far」加一行链接，然后删除本地单子（[ADR-0051](../../adr/0051-every-doc-type-has-an-end.md)）。
- 下一程（[#285](https://github.com/Abe-Junwei/Jieyu/issues/285)）的单子开工前只放在 GitHub，开工时再建本地文件。
