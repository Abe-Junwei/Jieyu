---
title: ADR 0064 - 桌面版能打开真项目之前冻结新功能；浏览器构建的终点
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-17
source_of_truth: decision-record
depends_on:
  - ./0047-desktop-build-strips-collab-keys-telemetry.md
  - ./0059-electron-shell-skeleton.md
  - ./0063-desktop-only-after-electron-skeleton.md
---

# ADR 0064：桌面版能打开真项目之前冻结新功能；浏览器构建的终点

## 状态

accepted。用户 2026-10-17 在 grill-with-docs 访谈里逐张选定。本篇不改 [ADR-0063](./0063-desktop-only-after-electron-skeleton.md) 的正文，只补它没定的部分：0063 第 1 条之后到桌面版能用之前怎么办，以及第 2 条「只留作开发与测试」什么时候结束。

## 背景

[ADR-0059](./0059-electron-shell-skeleton.md) 第 2 条的骨架只证明一次写入临时 `project.sqlite`，渲染进程不打开数据库。完整存储要等 [#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 的 SQLite 实现，导入、删除、送垃圾箱要等 [#325](https://github.com/Abe-Junwei/Jieyu/issues/325)。0063 说骨架跑通后新功能只按桌面实现，但那时桌面版还打不开一个真项目，新功能没有地方验收。

## 决策

1. **从现在起冻结新功能。** 先做 [#276](https://github.com/Abe-Junwei/Jieyu/issues/276)，再做 #275 和 [#280](https://github.com/Abe-Junwei/Jieyu/issues/280)。冻结期只修 bug 和防丢数据的问题。路线图 Stage A 的切片全部暂停，挡首发的新功能（[#303](https://github.com/Abe-Junwei/Jieyu/issues/303)–[#306](https://github.com/Abe-Junwei/Jieyu/issues/306)、[#312](https://github.com/Abe-Junwei/Jieyu/issues/312)、[#313](https://github.com/Abe-Junwei/Jieyu/issues/313)）也排到冻结之后。
2. **#275 和 #325 都落地才解冻。** 那时桌面版能导入录音、编辑、删除，新功能才有地方验收。
3. **#276 跑通就撤浏览器承诺。** 不等解冻（[#328](https://github.com/Abe-Junwei/Jieyu/issues/328)）。
4. **#275 之后新增的业务操作只写 SQLite 实现。** Dexie 实现冻结，只修 bug。vitest 直接在 Node 里跑 SQLite 实现。
5. **E2E 迁到 Electron 算冻结期内的工作。** #275 能打开真项目后开始，和 #325 并行（[#329](https://github.com/Abe-Junwei/Jieyu/issues/329)）。
6. **浏览器构建有终点。** E2E 全部迁到 Electron，并且 [#326](https://github.com/Abe-Junwei/Jieyu/issues/326) 把旧库迁完，就连同 Dexie 实现一起删掉。0063 第 4 条的 JYB 导出保留到这一步。
7. **只服务浏览器的代码按一条规则处理。** 协作与 Supabase 代码保留，桌面构建继续编译期剔除（ADR-0047），等主路线图 C4。其余代码：桌面已有替代的（如 keyVault，桌面用 `safeStorage`）随浏览器构建一起删；没有替代的列进 #328 的清单，由用户逐项定。

## 影响

- 首发顺序变成：#276 → #275（同时 #280）→ #325 与 #329 → 解冻 → #303–#306、#312、#313、#277、#326、#258、#281 并行 → #259（只等 #258、#281 与存储几步）→ [#282](https://github.com/Abe-Junwei/Jieyu/issues/282)。发布流水线 [#277](https://github.com/Abe-Junwei/Jieyu/issues/277) 也排到解冻后。
- 只出决定、调研、原型或文档、不改产品代码的单子不受冻结，如许可证核对（[#307](https://github.com/Abe-Junwei/Jieyu/issues/307)）。
- better-sqlite3 要同时在 Node（vitest）和 Electron 下可用，两套原生模块的构建由 #275 解决。
- 浏览器构建删掉后，`桌面端浏览器支持策略` 早已随 #328 删除，`AGENTS.md` 的 Chromium E2E 门槛随 #329 改成 Electron E2E。

## 被放弃的备选方案

1. 把触发点拆成两个，冻结期内新功能照常按存储接口写、在 Dexie 上测：被否决。用户选择集中人力完成桌面存储。
2. 只停碰存储的新功能，或允许结构重构继续：被否决。用户选了全停。
3. 冻结从 #276 跑通才开始：被否决。用户选了从现在起。
4. #275 落地就解冻，或等 #280 基线到 0 才解冻：被否决。用户选了 #275 加 #325。
5. Dexie 与 SQLite 两边都写，浏览器构建长期留作测试载体；或另写内存实现：被否决。
6. 协作代码随浏览器构建一起删：被否决。用户选择保留，等 C4。
