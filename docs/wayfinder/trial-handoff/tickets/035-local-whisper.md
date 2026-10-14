---
title: 本地 Whisper 转写：模型接口第一个实现
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [036]
issue: https://github.com/Abe-Junwei/Jieyu/issues/303
---

# 本地 Whisper 转写：模型接口第一个实现

## Question

试用版本机与云端转写都保留（用户 2026-10-13 21:16），本单挡首个试用版（2026-10-14 Q1）。用解语自带的 whisper-server（`src/tools/whisper-server`）改成实现合同 v1，不用 whisper.cpp 官方 `/inference`；经主进程 ModelHost（[#305](https://github.com/Abe-Junwei/Jieyu/issues/305)）调用，结果进候选面板（[#306](https://github.com/Abe-Junwei/Jieyu/issues/306)）。方案见 [model-interface-plan.md](../model-interface-plan.md)。

已定（用户 2026-10-14）：
- 平台：只出 Apple 芯片 Mac 与 Windows x64。
- `whisper-cli`：随安装包带各平台预编译版（Mac 开 Metal，Windows 纯 CPU），与应用一起签名公证；主进程经 `WHISPER_CLI` / `FFMPEG_PATH` 传路径，ffmpeg 复用随包 LGPL 版。
- 模型权重：安装包不带；首次用本机转写时应用内下载，sha256 校验后存 `userData/models/`，显示进度、可取消、断网提示；默认推荐 small，可选 base，Windows 默认 base。
- 下载源：GitHub Releases 为主，失败依次退 Hugging Face、hf-mirror.com，同一 sha256。
- Windows 长录音（约 30 分钟以上）提示可改用云端转写；速度用 2 小时录音实测并记录，不设门槛。
- 前置：whisper-server 只监听 127.0.0.1 的修复（`fix/whisper-server-bind-localhost`）先合进 main。
