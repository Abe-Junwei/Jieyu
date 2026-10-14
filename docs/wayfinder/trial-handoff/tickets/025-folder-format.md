---
title: project.sqlite 表结构与 JYM 互转规则
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [029,024,036]
issue: https://github.com/Abe-Junwei/Jieyu/issues/275
---

# project.sqlite 表结构与 JYM 互转规则

## Question

已定（[ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md)，取代早先「解包 JYM、多个 JSON」）：项目文件夹 = `project.sqlite` + `media/`，磁盘不加密；JYM/JYT 仍是 JSON 交换包，导出导入时互转。定：表结构（按 [#279](https://github.com/Abe-Junwei/Jieyu/issues/279) 归入项目层的数据，含 `documents[]`、改为项目所有的 ADR-0044 覆盖行）、版本号与升级规则、媒体在 `media/` 下的命名、与 JYM manifest 的一一对应。D14 冻结的就是这个格式。

已定，表结构需支持：
- 音频 WAV/MP3/M4A/FLAC 原样复制进 media/。
- 视频：抽出音轨，音轨与原视频都存进 media/；播放与波形用音轨。
- JYM 跨版本：新版自动升级旧包、旧版拒绝新包（见 [#266](https://github.com/Abe-Junwei/Jieyu/issues/266)）。

