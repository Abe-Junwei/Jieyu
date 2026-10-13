# Wayfinder 本地 Markdown 追踪约定

- 每张地图一个目录：`docs/wayfinder/<map>/`，地图本体为 `map.md`（等同 `wayfinder:map` issue）。
- 单子为 `tickets/NNN-<slug>.md`，编号即 id；front matter 字段：
  - `title`（名字，引用时用名字）、`label`（`wayfinder:research|prototype|grilling|task`）、`mode`（HITL/AFK）
  - `status`（open/closed）、`assignee`（认领者，空即未认领）、`blocked_by`（id 列表）
- 前线 = status open、blocked_by 全部 closed、assignee 为空。
- 解决时：在单子末尾加 `## Resolution`，status 改 closed，并在 map.md「Decisions so far」加一行链接。
