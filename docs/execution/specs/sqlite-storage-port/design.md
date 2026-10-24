---
title: sqlite-storage-port design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-24
source_of_truth: sqlite-storage-port-spec
depends_on:
  - ./requirements.md
---

# Design — sqlite-storage-port

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`src/desktop/skeleton/probeStore.ts` 用 better-sqlite3 的 `transaction` 做一次 BEGIN/COMMIT，提交后读回。迁移脚本用 `node:sqlite`，那是文件原型，不是这个接口。
- 同类产品 / 标杆实现：SQLite 作者和 better-sqlite3 都把一次事务写成同步函数，不把事务挂在多次 IPC 上。
- 业内 best practice / 事实标准 / 规范：SQLite 一个连接上的事务只覆盖那一个库文件。两份文稿、文件位置或系统垃圾箱用 ADR-0060 第 4 条的操作记录。说话人分配改的是项目库和一份文稿，各提交一次，见 ADR-0071。
- 公认不可行 / 反模式 / 已弃用方案：ADR-0048 已放弃 `node:sqlite` 和跨多次 IPC 持有事务。
- 潜在的坑：better-sqlite3 是原生模块，要跟 Electron 的 ABI 一起编译。userData 库不是 `.jyd`，不占用文稿的 `application_id`。
- 决定：**复用** better-sqlite3 的同步事务和现有 `StoragePort` 合同。userData 文件和项目文件夹由调用方传入。说话人分配不装成一个跨文件事务。正则拆分落在一份 `.jyd` 里，见 ADR-0072。语段编号只用这一列和 `id`，不读整份语段文档。空的 `text_id` 不算另一项目。轨道行也落在一份 `.jyd` 里，见 ADR-0073。来源记录落在项目库，见 ADR-0074。录音行也落在项目库，字节仍是普通文件，见 ADR-0075。另一项目的录音用这一行已有的 `text_id` 辨认。去掉一条空录音先改文稿再改项目库，见 ADR-0076。文稿改挂录音只替换一份 `.jyd` 上的那一条，见 ADR-0077。语段关系和父子链接只写在同一份文稿里，见 ADR-0078。桌面壳在开关打开时每个方法一次 IPC，见 ADR-0079。会话和消息留在项目库，见 ADR-0080。锚点按已有的 `media_id` 计数，不另加列。同一个编号在两份文稿里又落在同一条录音上就拒绝。词按语段已有的 `text_id` 计数，不另加列，不读整行。同一个编号在两份文稿里又属于同一项目就拒绝。审计列表读 userData 里已有的 `payload_json`，不另加列。产物的创建时间在项目库可空的 `created_at` 上，见 ADR-0081。迁移不读这列，旧库不加列。写入先提交产物，再提交 userData 里的审计。

## 2. 架构选择

- 落位类别：effect。写入在 `src/db/sqliteStoragePort.ts`，不进页面。
- 关键 trade-off：回合和审计属于一个库。说话人分配跨项目库和 `.jyd`，按 ADR-0071 分成多次提交，提交后读回。
- 拒绝的方案：把语段先写进 userData，迁就合同测试。那会和 ADR-0061 的文件分工相反。把两个库 ATTACH 成一个事务也不可用。

## 3. 落位清单

| 文件                                            | 职责                                                                                                                                                                                   | 复杂度估计 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/db/sqliteStoragePort.ts`                   | 打开 userData 库和可选的项目文件夹，转给回合、审计、说话人分配、正则拆分、轨道行、来源记录、录音行、去掉空录音、文稿改挂录音、语段关系、锚点计数、词计数、审计列表和产物，其余方法拒绝 | < 300 行   |
| `src/db/sqliteSpeakerAssignment.ts`             | 项目库和 `.jyd` 上的说话人分配                                                                                                                                                         | < 360 行   |
| `src/db/sqliteRegexSplit.ts`                    | 一份 `.jyd` 上的正则拆分                                                                                                                                                               | < 360 行   |
| `src/db/sqliteTrackEntity.ts`                   | 一份 `.jyd` 上的轨道行写入和按项目列出                                                                                                                                                 | < 280 行   |
| `src/db/sqliteSourceRecords.ts`                 | 项目库上的来源记录登记、改名和关联                                                                                                                                                     | < 320 行   |
| `src/db/sqliteMediaItems.ts`                    | 项目库上的录音行保存、按项目列出，以及标出另一项目的录音                                                                                                                               | < 280 行   |
| `src/db/sqliteRemoveEmptyRecording.ts`          | 去掉一条空录音：先改碰到的 `.jyd`，再改项目库                                                                                                                                          | < 220 行   |
| `src/db/sqliteManuscriptAudio.ts`               | 一份 `.jyd` 上替换文稿关联的录音                                                                                                                                                       | < 160 行   |
| `src/db/sqliteUnitLinks.ts`                     | 同一份 `.jyd` 上的语段关系和父子链接                                                                                                                                                   | < 180 行   |
| `src/db/ipcStoragePort.ts`                      | 渲染进程上的存储接口代理，每个方法一次调用                                                                                                                                             | < 80 行    |
| `src/db/installSqliteIpcPort.ts`                | 开关打开且桌面桥存在时才安装这个代理                                                                                                                                                   | < 50 行    |
| `src/desktop/skeleton/sqliteStorageHost.ts`     | 主进程打开已锁定文件夹上的两份库并转发一次调用                                                                                                                                         | < 120 行   |
| `src/desktop/skeleton/sqliteStoragePortFlag.ts` | 开关解析：只有 `1` 和 `true` 是开                                                                                                                                                      | < 20 行    |
| `src/db/sqliteAiConversations.ts`               | 项目库上的会话和消息：改标题、改正文、清空一个会话的消息                                                                                                                               | < 280 行   |
| `src/db/sqliteLayerUnitIds.ts`                  | 按已有的 `id` 和 `text_id` 列出语段编号、数还在的语段，并标出另一项目的语段                                                                                                            | < 160 行   |
| `src/db/sqliteAnchors.ts`                       | 按已有的 `media_id` 数锚点。同一个编号在两份文稿里又落在同一条录音上就拒绝                                                                                                             | < 120 行   |
| `src/db/sqliteUnitTokens.ts`                    | 按语段已有的 `text_id` 数词。同一个编号在两份文稿里又属于同一项目就拒绝                                                                                                                | < 120 行   |
| `src/db/sqliteAuditLogs.ts`                     | 按已有的 `payload_json` 列出审计。空白查询是空列表                                                                                                                                     | < 120 行   |
| `src/db/sqliteAgentArtifacts.ts`                | 项目库上的产物。可空的 `created_at`。先提交产物，再提交 userData 里的审计                                                                                                              | < 160 行   |
| `src/db/sqliteStoragePort.test.ts`              | 关掉再打开读回，合同测试的种子是项目文件夹                                                                                                                                             | 测试       |

约束自查：

- [x] 不新增 hook
- [x] 编排层不写库
- [x] 不引入 `src/features/…`
- [x] 不涉及面板

## 4. ADR 引用

- 相关 ADR：ADR-0048、ADR-0058、ADR-0060、ADR-0061、ADR-0069、ADR-0070、ADR-0071、ADR-0072、ADR-0073、ADR-0074、ADR-0075、ADR-0076、ADR-0077、ADR-0078、ADR-0079、ADR-0080、ADR-0081
- 是否需要新建 ADR：说话人名单和语段种类见 ADR-0071。正则拆分的列和单文件事务见 ADR-0072。语段编号沿用这一列。轨道行的项目编号、更新时间和单文件事务见 ADR-0073。来源记录的列和项目库事务见 ADR-0074。录音行见 ADR-0075。去掉一条空录音的顺序见 ADR-0076。文稿改挂录音见 ADR-0077。跨文稿关系见 ADR-0078。桌面壳的开关、两份库和一次 IPC 见 ADR-0079。会话和消息的列见 ADR-0080。锚点计数沿用 ADR-0072 的 `media_id`。词计数沿用 ADR-0072 的 `units.text_id`。审计列表沿用 userData 里已有的 `payload_json`。产物的创建时间见 ADR-0081。剩余方法的待确认设计见 [存储接口剩余方法](../../plans/sqlite-storage-port-remainder-2026-10-24.md)，本篇不接受那些决定。车道锁定表沿用 ADR-0069。来源不进定义副本，沿用 ADR-0070。库的分工沿用 ADR-0060 和 ADR-0061。音频字节仍是普通文件，沿用 ADR-0061。

## 5. Feature flag

- `sqliteStoragePortEnabled` 默认关，环境变量 `VITE_SQLITE_STORAGE_PORT_ENABLED`。主进程看 `JIEYU_SQLITE_STORAGE_PORT`。两边都打开才安装。浏览器没有这座桥，不会装上。冒烟只给这一次运行把主进程开关打开。

## 6. 失败模式 / 兼容性

- 旧用户路径：开关关掉时浏览器和桌面都仍用 Dexie。
- `project.sqlite` 缺少项目库 `application_id`，或 userData 文件落在项目文件夹里，就拒绝打开。
- 读回失败抛 `StorageReadbackError`，不在提交后撤销。
