---
title: '0046 — 桌面版存储：项目文件夹 = project.sqlite + media/，存储接口两种实现'
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-13
source_of_truth: decision
---

# 0046 — 桌面版存储：项目文件夹 = project.sqlite + media/，存储接口两种实现

- 状态：已接受（用户 2026-10-13 19:33–19:51 拍板；D14 冻结前）
- 取代：同日早些时候「项目文件夹 = 解包 JYM、多个 JSON」的口径（wayfinder #275 旧版）。
- 相关：ADR-0044（目录按项目）、ADR-0008（冻结点前提）、ADR-0031（keyVault，见 ADR-0047）、rev5 方案 D1/D5–D7/D14。

## 背景

试用版改为 Electron 桌面应用，项目数据要落在磁盘上。JYM 是一份 `data/project.json` + `media/` 的交换包，每次保存重写整份 JSON 会卡顿，断电也可能写坏。约 297 个非测试模块直接用 Dexie。用户目前没有需要保留的真实数据，D14 未触发，仍可重置基线。

## 决策

1. **规范存储 = SQLite。** 一个项目 = 一个项目文件夹 = `project.sqlite` + `media/`。磁盘不加密；加密 JYM 只用于导出。
2. **JYM/JYT 仍是 JSON 交换包**，导出、导入时与 SQLite 互转；不是活文件。
3. **统一存储接口（repository，方案 B）。** 桌面实现 = Electron 主进程里的 SQLite（如 better-sqlite3）；浏览器构建（只供开发与测试）实现 = Dexie。现有直连 db 的模块分批迁到接口；新代码必须走接口。
4. **两层数据。** 项目内容在项目文件夹；偏好、缓存、可重建索引在 Electron `userData`。现有 8 个 IndexedDB 库逐库归层。ADR-0044 里沿用全局 ID 的覆盖行（语言覆盖、内置正字法覆盖、LIFT 词条）改为归项目所有。
5. **媒体。** 导入的媒体一律复制进 `media/`。冻结前不新增 `byteLocation` 取值。
6. **快照。** 覆盖前快照、升级前快照、恢复导出放 `userData/backups/<项目>/`，不随项目互传；照搬「写入后读回校验」。桌面版每个项目每天自动存一份 JYM 快照，保留 3 份，外加格式升级前快照。JYB 只留在浏览器构建。
7. **多文稿。** 试用版开放多文稿，格式保留 `documents[]`。资料组与访问级别以后用只加不改的迁移加入；冻结前演练一次这类迁移。
8. **冻结（D14）。** D14 原文保留，补充：冻结对象 = 项目文件夹格式（SQLite + media/），在第一个试用版发布之前冻结。

## 影响

- 需要：存储接口定义、8 库归层清单、SQLite 表结构、模块分批迁移、一次加法迁移演练（见 wayfinder 地图 #250）。
- 主路线图 §1「纯 Web、真源 IndexedDB」与本决定冲突，由 #278 修改。
