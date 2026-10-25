---
title: ADR 0085 - 桌面项目一个 SQLite 库
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-25
source_of_truth: decision-record
depends_on:
  - ./0049-decisions-not-current-state-inventories.md
---

# ADR 0085：桌面项目一个 SQLite 库

## 状态

accepted。用户 2026-10-25 要求按产品目的写出完整架构：存储层不再对齐 Dexie，以后只维护 SQLite；没有历史数据，也不为旧文件或浏览器库做兼容。同日对照现有实现后收窄：新库自己初始化并验证，不复用旧的 marker；父子只保住已经实现的「不跨文稿」；语段和正文同事务写入。提交后的 IPC 失败、运行中复制、备注级联不作为第一步的阻塞项。文件夹布局和存储实现以本篇为准。旧篇正文不改写。和本篇冲突时，以本篇为准。表集还不是全产品字段的覆盖评估。

## 背景

桌面要打开的是一个研究项目：文件夹里有录音，有多层转写和标注，关掉再打开还在，写到一半崩溃不能留下半行。

现行实现把结构化数据拆进 `project.sqlite` 和每份文稿一个 `.jyd`，再让 SQLite 方法去对齐 Dexie 的文档形状。一个事务盖不住两个库文件，所以说话人分配、去掉空录音、产物加审计都是多次提交，读回失败也不能撤销。后加的空列还要区分「没补完」和「坏了」，因为旧行没有那些列。这些机制都是在保护并不存在的旧文件，以及一套不再维护的浏览器库。

## 决策

1. 一个项目文件夹里只有一份结构化数据库 `project.sqlite`，加上普通音频文件。文稿是表里的一行，不是另一个库文件。音频字节不进库。应用密钥和窗口状态留在 userData，不进这个文件夹。跟这份材料有关的对话写在 `project.sqlite`。
2. 只维护这一套 SQLite。不为 Dexie 保留同一套方法、合同测试或开关。浏览器里已有的屏幕可以暂时继续用 Dexie，直到那块界面改接本篇；新的存储代码不返回 Dexie 的文档类型，也不读 IndexedDB。
3. 新建和打开分开。`project.sqlite` 不存在时，在同目录写临时文件，写入 `application_id` `0x4a59504a`、建好下面全部表、再改名成 `project.sqlite`。中途失败就删掉临时文件，不留下半个库。文件已经存在时，先读 `application_id` 和表结构，对不上就关闭并拒绝。这条路径不建表、不写、不改名。同名表但列或约束不对，同样拒绝，文件字节保持打开前的样子。这是格式校验，不是补列，也不是迁移。日志模式 `DELETE`。直接复制项目文件夹之前先关闭项目。项目开着时要备份，用 SQLite 的在线备份，不用普通文件复制。写事务仍会使用回滚日志，普通复制没有事务快照。
4. 一次业务操作是主进程里的一次事务，也是一次 IPC。调用方不传表名、不持有事务。事务内抛错则回滚，库回到这次操作之前，包括已经写入第一张表之后才失败的情况。提交成功之后才把返回值送回渲染进程。提交之后 IPC 失败，调用方看到的是结果未知，不是「已经回滚」。不自动重试。以后若要自动重试，另定去重。调用方用成功返回值里的 id，不再靠列出前后的差集判断有没有写上。
5. 必填列是 `NOT NULL`。外键打开。枚举用 `CHECK`。`NULL` 只表示产品上可以没有的关系，例如层没有父层、语段没有说话人。它不表示「这列以后再补」。
6. 时间轴的起止时间写在语段行上，单位与播放器相同，用秒。改一条边界是一次操作，在同一个事务里改相邻语段的时间。不另建锚点表。
7. 进度、词数、录音上的锚点个数是查询，不另存表。不建 `segment_meta`、`translation_status_snapshots`、`annotation_documents`、`mcp_tool_call_audits`。标注文档就是文稿。工具调用若要和这次修改绑在一起，写在同一个事务里。
8. 一份文稿只挂一条录音。语段通过所属的层找到文稿，再找到这条录音，语段行上不再存一份录音 id。

### 文件夹

```text
项目文件夹/
  recording-a.wav
  project.sqlite
  .jieyu.lock
```

`.jieyu.lock` 仍用来挡住第二个进程同时写这个文件夹。锁不是数据库。

### 表

`project`：`id`，`title_json`，`settings_json`，`created_at`，`updated_at`。`settings_json` 放项目设置（字符变体、缩写、词类），默认 `'{}'`。标题是字符串映射，至少有一条非空字符串。

`media`：`id`，`relpath`（相对文件夹，唯一），`sha256`，`filename`，`duration`，`created_at`。

`speakers`：`id`，`name`，`created_at`，`updated_at`。说话人属于整个项目。

`manuscripts`：`id`，`title_json`，`media_id` 引用 `media`，`created_at`，`updated_at`。

`layers`：`id`，`manuscript_id`，`key`，`name_json`，`tier_type`，`content_type`，`language_id`，`orthography_id`，`parent_id`，`sort_order`，`created_at`，`updated_at`。同一文稿里 `key` 唯一。`tier_type` 只接受 `time-aligned`、`time-subdivision`、`symbolic-subdivision`、`symbolic-association`。`content_type` 只接受 `transcription`、`translation`、`gloss`、`pos`、`note`、`custom`。语言、正字法和父层可以空。名称、类型、内容类型和时间不能空。`parent_id` 不空时必须是同一文稿里的层。自指和成环还没有对照完整的领域规则，不在本篇里写成已经确认的约束。

`units`：`id`，`layer_id`，`speaker_id`，`parent_unit_id`，`start_time`，`end_time`，`created_at`，`updated_at`。`end_time >= start_time`。说话人和父语段可以空。`parent_unit_id` 不空时，父语段必须属于同一文稿。这是现有 `setUnitParentInProject` 已经拒绝的跨文稿链接。不要求父语段落在父层上。

`unit_texts`：`id`，`unit_id`，`role`，`body`，`updated_at`。`units.create` 的 `text` 在同一事务里写成一行，`role` 为 `transcription`，`body` 为传入的字符串。读回这两行之后才提交。其他角色以后再写，不在这一步把 `role` 收成层的 `content_type`。

`tokens`：`id`，`unit_id`，`token_index`，`form`。同一语段里序号唯一。

`morphemes`：`id`，`token_id`，`morpheme_index`，`form`。同一词里序号唯一。

`notes`：`id`，`target_type`，`target_id`，`body`，`created_at`，`updated_at`。`target_type` 只接受 `layer`、`unit`、`token`、`morpheme`。这张表不做跨类型外键。做到备注时，新增要确认目标存在，删除要在同一事务里清掉被删行及其后代上的备注。不在第一步验收。

`sources`：`id`，`media_id`，`label`，`external_id`，`created_at`，`updated_at`。不存来源原件字节。

`conversations`：`id`，`title`，`created_at`，`updated_at`。

`messages`：`id`，`conversation_id`，`role`，`body`，`created_at`。不存引用和推理正文。

### 调用

渲染进程只拿到这些函数。SQL 不出现在页面和 AI 里。

```ts
const project = await openProject(folder);

const manuscript = await project.manuscripts.create({ title, mediaId });
const layer = await project.layers.create({
  manuscriptId: manuscript.id,
  key: "tx",
  name: { zh: "转写" },
  tierType: "time-aligned",
  contentType: "transcription",
});
const unit = await project.units.create({
  layerId: layer.id,
  startTime: 0,
  endTime: 1.2,
  text: "…",
});
// unit.text 来自 unit_texts 里 role = transcription 的那一行。
```

`units.create` 在同一事务里写 `units` 和一行 `unit_texts`，读回后再提交。`create` 和按 id 读返回同一种语段：行字段加上 `text: string`。不另做一层包装类型。按 id 读，没有这行就返回空。跨文稿的父语段写不进去。

设置从 `project.settings` 读，写的时候替换整份 `settings_json`，同一次事务读回。

### 模块

| 模块 | 职责 |
| --- | --- |
| `src/db/desktop/schema.ts` | 唯一的建表语句 |
| `src/db/desktop/openProject.ts` | 主进程打开库。已有文件只验证；文件不存在才原子初始化 |
| `src/db/desktop/manuscripts.ts` | 文稿 |
| `src/db/desktop/layers.ts` | 层 |
| `src/db/desktop/units.ts` | 语段、正文、边界 |
| `src/db/desktop/lexicon.ts` | 词和词素 |
| `src/db/desktop/notes.ts` | 备注 |
| `src/db/desktop/speakers.ts` | 说话人 |
| `src/db/desktop/media.ts` | 录音登记。字节仍是文件夹里的文件 |
| `src/db/desktop/conversations.ts` | 对话 |
| `src/db/desktop/client.ts` | 渲染进程的 IPC 客户端，函数与上面同名 |

主进程执行函数。渲染进程一次调用一个函数。better-sqlite3 不进渲染进程。

### 第一步

在 `src/db/desktop/` 做独立实现。旧的 SQLite `StoragePort`、`.jyd` 扫描和 Electron 的 `storage:open/call/reopen` 先留着，屏幕仍走原路径。不把半成品库迁成新表。这一步只证明：

- 创建文稿、层、语段和正文，关掉再打开，读回的正文与创建时返回的相同。
- 语段行已经插入、正文还没写上时注入失败，重开后两张表都没有这次的行。

不改 Dexie 屏幕，不接文件夹选择器。标识校验、跨文稿父语段、提交后 IPC 断开、运行中备份、备注级联，规则写在上面，不在这一步的验收里。

## 影响

- 访达里看不到「一份文稿一个文件」。交出一份文稿走导出。
- 现有 `.jyd`、分列补全、以及「列出失败再用差集猜落没落地」都不再用于这条路径。
- 目录里已有 ADR 的正文保持原样。和本篇冲突的条款不再作为活存储的依据。
- 直连 Dexie 的屏幕不在本篇里迁移。
- 主进程里的 better-sqlite3、打包、preload 和 IPC 通道留用，改接新的项目 API。密钥仍在 userData。说话人、录音、语段关系、对话里仍然适用的校验，按单库事务重写，不照搬旧的行类型。停止扩展扫描 `.jyd`、跨库逐次提交、缺列探测、空列补全和 Dexie 形状对齐。现在不删这半套代码：Electron 还接在上面，工作区里还有未提交的修改。新路径接替一块，再删对应的旧模块。旧测试里「关掉再打开仍能读回」的意图保留；「审计失败仍留下产物」与本篇的同一事务冲突，换到新路径时改成整次回滚。

## 被放弃的备选方案

1. 继续一份文稿一个 `.jyd`。跨文稿的一次修改盖不住一个事务，半截写入去不掉。
2. 保留 Dexie 与 SQLite 两套相同接口。用户已确定以后只维护 SQLite。
3. 保留「空列是未补全」的读法。没有旧行时，这种状态只能由写入漏列产生。漏列应由 `NOT NULL` 在写入时挡住。
4. 用 WAL。复制项目文件夹时会带上旁路文件。
5. 另建锚点表，让相邻语段共享边界点。同库的一次事务可以同时改两行的时间。
6. 把进度和翻译状态存成独立表。它们是语段行算出来的。
7. 把「父语段必须落在父层上」和禁止成环写成已经确认的规则。现有实现只拒绝跨文稿的父子链接。
8. 现在删掉半套 SQLite 端口。桌面调用还走它。
9. 为了语段正文再加一层类型。同一事务写两张表、读回后提交就够了。
