---
title: 旧浏览器库经 JYB 迁入桌面项目文件夹
label: wayfinder:task
mode: HITL
status: open
assignee:
blocked_by: [025,043]
issue: https://github.com/Abe-Junwei/Jieyu/issues/326
---

# 旧浏览器库经 JYB 迁入桌面项目文件夹

## Question

本单挡首个试用版（用户 2026-10-17），是 [#282](https://github.com/Abe-Junwei/Jieyu/issues/282)「不丢数据」硬门槛的一项。

[ADR-0062](../../../adr/0062-desktop-storage-decisions-2026-10-16.md) 第 5、6 条：旧浏览器数据先在浏览器导出一份带音频的 JYB，再导入桌面项目文件夹，导入前做容量预检。已经挂着多条录音的旧文稿按录音拆成多份，先列完整清单，用户确认后才写。合成规划已在 `src/db/projectFiles/planLegacyMigration.ts` 和 `scripts/apply-legacy-plan.mjs`，不读 IndexedDB，只用合成材料测过。

要做：

- 桌面端接受一次 JYB 导入（ADR-0062 第 6 条放宽了 [ADR-0046](../../../adr/0046-desktop-sqlite-project-folder.md) 第 2 条）。JYB 解析成规划器的输入。
- 容量预检：目标盘剩余空间、单个媒体 1 GiB、整包约 4 GiB（ZIP32）。超过时要有分批或流式通道，没有就停下说明。
- 拆分清单：每条录音一份新文稿。列出会丢弃的语段、关系、父子链接和备注，用户确认后才写。
- 写入失败删掉这次写出的文件；JYB 和浏览器库都不动。
- 每日 JYM 继续（ADR-0062 第 1 条）。

不做：直接读 IndexedDB 写 `.jyd`（ADR-0062 已否决）。在真实语料上执行前，由用户本人确认。

验收：合成 JYB 导入后关掉重开、逐 id 读回；容量不够时不写任何文件；未确认时不写；拆分后每份 `.jyd` 只有一条录音。
