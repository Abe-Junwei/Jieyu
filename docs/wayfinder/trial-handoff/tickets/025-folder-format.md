---
title: 桌面项目文件夹格式与 JYM 互转规则
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [029,024,036]
issue: https://github.com/Abe-Junwei/Jieyu/issues/275
---

# 桌面项目文件夹格式与 JYM 互转规则

## Question

2026-10-16 更新：文件夹内容布局以 [ADR-0061](../../../adr/0061-jyd-manuscript-file-audio-stays-plain.md) 为准（音频原文件、一份文稿一个 `.jyd`、声文稿只是展示），不再是 `project.sqlite` + `media/`。D14 还不冻结这个格式。JYM/JYT 仍是 JSON 交换包。有效条款见 [ADR 目录](../../../adr/README.md)。

原先已定（[ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md)，取代早先「解包 JYM、多个 JSON」）：项目文件夹 = `project.sqlite` + `media/`，磁盘不加密；JYM/JYT 仍是 JSON 交换包，导出导入时互转。还要定：表结构（按 [#279](https://github.com/Abe-Junwei/Jieyu/issues/279) 归入项目层的数据，含 `documents[]`、改为项目所有的 ADR-0044 覆盖行）、版本号与升级规则、媒体文件的命名、与 JYM manifest 的一一对应。

2026-10-16 还要定的列形状（合成迁移已写完标量行，见 [card-sqlite-file 规格](../../../execution/specs/card-sqlite-file/tasks.md)）：

- 会话记忆载荷已定（[ADR-0066](../../../adr/0066-session-memory-payload-json.md)）：项目库一段 JSON 对象，不进定义副本。关掉再打开能读回。
- `model_runs` 已按 [ADR-0057](../../../adr/0057-model-interface-transcribe.md) 第 8 条建在项目库，不另行设计。能力只收 `transcribe`。
- 词条 DMLex 正文已定（[ADR-0068](../../../adr/0068-lexeme-dmlex-json.md)）：词条行上的 JSON 对象，不把义项拆成表，不进定义副本。
- 语言记录上的数组、行政区划、多语备注和自定义字段值已定（[ADR-0067](../../../adr/0067-language-document-json-columns.md)）：语言行上的 JSON，不进定义副本。
- 结构规则正文、正字法转换规则与样例、车道锁定表。
- 词条、标签、自定义字段、缩写要不要进 `.jyd` 的定义副本。

定一块写一块，每块写完关掉重开读回。之后才是存储端口的 SQLite 实现。

SQLite 实现里的业务操作要守住（2026-10-17 从 #327 并入，[ADR-0063](../../../adr/0063-desktop-only-after-electron-skeleton.md) 第 3 条）：给文稿挂录音时，已有录音就是替换，不是追加，替换前提示（措辞由用户确认）；新建或修改 `unit_relations` 时两端不在同一份 `.jyd` 就不写，并说明原因。检查函数用 `src/db/projectFiles/manuscriptAudio.ts`、`manuscriptParents.ts`。验收：写入后关掉重开读回；挂第二条录音后只剩一条；跨文稿关系写不进去。

已定，文件夹里要有（ADR-0061，不再是 `media/`）：
- 音频 WAV/MP3/M4A/FLAC 原样复制进项目文件夹，不进数据库。
- 视频仍抽出音轨供播放与波形；音轨与原视频都留在项目文件夹里。
- JYM 跨版本：新版自动升级旧包、旧版拒绝新包（见 [#266](https://github.com/Abe-Junwei/Jieyu/issues/266)）。

