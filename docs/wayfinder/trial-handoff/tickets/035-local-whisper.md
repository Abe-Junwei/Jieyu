---
title: 本地 Whisper 转写：模型接口第一个实现
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [036]
execution_gate: M4
issue: https://github.com/Abe-Junwei/Jieyu/issues/303
---

# 本地 Whisper 转写：模型接口第一个实现


<!-- desktop-sqlite-slices:v1:start -->
## 当前可执行切片与关闭条件（2026-10-25 本轮重排）

归 M5-F：M4-C 通过后允许实施，不等待 #275/#325 整单关闭。

- [ ] 按现有合同提供随包本机引擎、模型下载/哈希、平台能力和回环安全；不改变本单已有平台/许可证约束。
- [ ] 与 #305 按“宿主接口+模拟服务先就绪，再接真实引擎”推进，不互等两张 issue 全关闭。
- [ ] 与 #306 接实际目标写入入口；来源/运行记录与采纳持久读回，媒体秒按映射换为文献秒。
- [ ] 回归文稿删除/恢复后的旧任务拒绝，新任务合法写入；真实平台转写证据交 #275/#282。

语段时间换算和持久写入不能复制旧首次声学导入重写文献秒行为。本单完成不等于 #275 终验完成。


详细前置/验收见[单库切片清单](../../../execution/plans/desktop-project-sqlite-2026-10-25.md#可领取切片与交付顺序2026-10-25-本轮重排)。本轮同步不代表实现完成；下方较早范围保留，冲突以本节为准。
<!-- desktop-sqlite-slices:v1:end -->

## 2026-10-25 已确认范围

M4 通过后按首发白名单开工，不等 #275/#325 整单关闭；转写结果必须接新单库并复用删除写门禁，删除前任务即使恢复文稿仍无写入资格；此集成是 #275 终验输入。 依据 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[ADR-0087](../../../adr/0087-project-deletion-retention-and-media-cleanup.md) 和[单库计划](../../../execution/plans/desktop-project-sqlite-2026-10-25.md)。GitHub 已于 2026-10-25 写入当前范围。以下原 Question 留作历史输入，冲突处按本节执行。

## Question

试用版本机与云端转写都保留（用户 2026-10-13 21:16），本单挡首个试用版（2026-10-14 Q1）。用解语自带的 whisper-server（`src/tools/whisper-server`）改成实现合同 v1，不用 whisper.cpp 官方 `/inference`；经主进程 ModelHost（[#305](https://github.com/Abe-Junwei/Jieyu/issues/305)）调用，结果进候选面板（[#306](https://github.com/Abe-Junwei/Jieyu/issues/306)）。方案见 [model-interface-plan.md](../model-interface-plan.md)。

已定（用户 2026-10-14）：
- 平台：只出 Apple 芯片 Mac 与 Windows x64。
- `whisper-cli`：随安装包带各平台预编译版（Mac 开 Metal，Windows 纯 CPU），与应用一起签名公证；主进程经 `WHISPER_CLI` / `FFMPEG_PATH` 传路径，ffmpeg 复用随包 LGPL 版。
- 模型权重：安装包不带；首次用本机转写时应用内下载，sha256 校验后存 `userData/models/`，显示进度、可取消、断网提示；默认推荐 small，可选 base，Windows 默认 base。
- 下载源：GitHub Releases 为主，失败依次退 Hugging Face、hf-mirror.com，同一 sha256。
- Windows 长录音（约 30 分钟以上）提示可改用云端转写；速度用 2 小时录音实测并记录，不设门槛。
- 只监听 127.0.0.1 + Host 头校验已合进 main（`bb5fb2a4`）。实现合同 v1 时补齐：Origin 校验（去掉 `Access-Control-Allow-Origin: *`，只放行本机来源）与连接来源回环 IP 判定（2026-10-14 评审遗留）。
