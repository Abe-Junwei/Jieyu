---
title: ADR 0063 - Electron 骨架跑通后只做桌面版，浏览器构建只留作开发与测试
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-17
source_of_truth: decision-record
depends_on:
  - ./0046-desktop-sqlite-project-folder.md
  - ./0059-electron-shell-skeleton.md
  - ./0062-desktop-storage-decisions-2026-10-16.md
---

# ADR 0063：Electron 骨架跑通后只做桌面版，浏览器构建只留作开发与测试

## 状态

accepted。用户 2026-10-17 选定。本篇不改已有 ADR 的正文。

## 背景

[ADR-0046](./0046-desktop-sqlite-project-folder.md) 第 3 条已经把浏览器构建定为「只供开发与测试」，但仓库仍按对外产品维护它：[桌面端浏览器支持策略](../architecture/桌面端浏览器支持策略.md) 对 Chrome、Edge、Firefox、Safari 和国内浏览器做了承诺，CI 每晚跑 Firefox 与 WebKit，新功能也按浏览器保存路径实现（如 [#327](https://github.com/Abe-Junwei/Jieyu/issues/327)）。这些都在给一个不会交给用户的形态付成本。

## 决策

1. **触发点是 Electron 骨架跑通。** [#276](https://github.com/Abe-Junwei/Jieyu/issues/276) 通过 [ADR-0059](./0059-electron-shell-skeleton.md) 的验收，就停止对浏览器形态的一切对外承诺，产品开发全部转到桌面版。触发前不改变现状。
2. **浏览器构建只留作开发与测试载体。** `vite dev`、Dexie 实现和 Playwright 照常可用，但不对任何浏览器作支持承诺。E2E 逐步改到 Electron 上跑；迁完之前，Chromium E2E 仍是合并门槛。
3. **新功能只按桌面实现。** 规则只在桌面写路径上实现和验收，不再先在浏览器保存路径上做一遍。#327（一份文稿一条录音、不存跨文稿关系）因此不单独做，并进 [#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 的存储操作和 [#325](https://github.com/Abe-Junwei/Jieyu/issues/325) 的文件操作。
4. **JYB 导出保留到旧库迁完。** 旧浏览器数据要靠浏览器导出的 JYB 迁入桌面（[ADR-0062](./0062-desktop-storage-decisions-2026-10-16.md) 第 6 条，[#326](https://github.com/Abe-Junwei/Jieyu/issues/326)）。在 #326 完成并经用户确认前，浏览器构建里的 JYB 导出不删、不坏。

## 影响

- 触发后：删除 [桌面端浏览器支持策略](../architecture/桌面端浏览器支持策略.md)；`browserslist` 收到 Electron 随附的 Chromium；去掉 Playwright 的 Firefox、WebKit 项目和每晚任务；`AGENTS.md` 里的浏览器支持一条改为指向桌面冒烟。
- 只在浏览器构建里有意义的代码（keyVault、浏览器侧协作同步等，见 [ADR-0047](./0047-desktop-build-strips-collab-keys-telemetry.md)）在触发后另行清点，本篇不定去留。
- 浏览器里已经挂着多条录音的旧文稿不在浏览器里处理，迁入时按 ADR-0062 第 5 条拆分。

## 被放弃的备选方案

1. 以首个试用版发布或 D14 冻结为触发点：被否决。用户选了骨架跑通。
2. 触发后连开发与测试用的浏览器构建一起删掉：被否决。Dexie 实现和浏览器 E2E 在 Electron E2E 补齐前仍是主要测试手段。
3. #327 照原样先在浏览器保存路径上做：被否决。浏览器形态不再交付，这一遍只会被重写。
