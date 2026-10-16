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

已定，表结构需支持：
- 音频 WAV/MP3/M4A/FLAC 原样复制进 media/。
- 视频：抽出音轨，音轨与原视频都存进 media/；播放与波形用音轨。
- JYM 跨版本：新版自动升级旧包、旧版拒绝新包（见 [#266](https://github.com/Abe-Junwei/Jieyu/issues/266)）。

