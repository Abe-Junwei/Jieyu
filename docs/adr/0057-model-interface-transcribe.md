---
title: ADR 0057 - 模型接口这一程只做转写，结果一律是候选
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
---

# ADR 0057：模型接口这一程只做转写，结果一律是候选

## 状态

accepted。用户 2026-10-13 21:06、21:14、21:23 拍板。合同例子与实现顺序留在[模型接口方案](../wayfinder/trial-handoff/model-interface-plan.md)。

## 背景

试用版要接入用户自带的语音模型。现有本地 Whisper 走渲染进程里的自带 `whisper-server`，结果类型没有统一的来源行。`source_records` 记的是导入文件，不是一次模型运行。对齐任务类型除了测试没有调用方。桌面壳还没落地，模型调用要等主进程。

D14 冻结前必须定下 `model_runs` 的表形状，以及语段 `provenance.params` 里指向它的键名。赶不上冻结就只用一次只加不改的迁移加表，不复用别的表。

## 决策

1. 这一程的能力只有 `transcribe`。对齐、VAD、分词、注释、翻译以后各写决定，不在本篇里预留第二套合同。
2. 传输只有一种：主进程向本机回环 HTTP 发请求。命令行、进程内 ONNX、MCP、远程地址这一程不做。第一个实现是解语自带的 whisper-server（#303），不用 whisper.cpp 官方 `/inference`。主进程要等桌面壳（#276）。
3. 协议版本只有 `"jieyu": "1"`，写在请求和响应外壳里。主版本不同就拒绝。次版本之间双方忽略未知字段。
4. 时间单位是秒，一律相对原始媒体的起点。音频只以 multipart 上传字节，不传本机路径。解语按声明文件里的 `audio.accept` 转码。超过 `maxAudioSec` 时由解语切块，块不重叠，每块一次同步请求，再把时间平移回原时间轴。取消用 AbortController。超时默认 120 秒/块。进度按第 n/N 块由解语计算。不做 SSE 或 job 协议。
5. 端点固定为 `POST /transcribe` 和 `GET /health`。错误码是 `bad_request`、`unauthorized`、`unsupported_capability`、`unsupported_language`、`bad_audio`、`too_long`、`timeout`、`cancelled`、`internal`。解语另记 `bad_response`（响应不合合同）和 `unreachable`（连不上）。时间不在请求范围内，或 `start` 大于 `end`，整块算 `bad_response`。
6. 安全：自带服务只监听 `127.0.0.1`。令牌可选；服务不支持令牌时仍可连接，只显示警告。服务端只接受 Host 为 `127.0.0.1` 或 `localhost` 加端口。主进程按解析后的地址连接，只允许 127.0.0.0/8 和 `::1`，不跟随重定向。响应用严格 schema 校验；正文默认不超过 8 MB，单块 segments 不超过 10 000 条，超出整块丢弃。许可证 SPDX 表达式含 `NC` 时提示仅限非商用。
7. 每个模型一份 `jieyu-model.json`。`id` 用反向域名。`license` 用 SPDX；不是 SPDX 的写 `LicenseRef-` 并附原文链接。同一 id、更高版本视为升级，旧版本的 `model_runs` 保留。版本相同但声明哈希不同时要用户确认才覆盖。更低版本拒绝，除非用户显式降级。`orthography.id` 必须映射到项目里已有的书写系统或转写层之后才能运行；映射存 userData。
8. `model_runs` 是项目数据，每次运行一行。字段是 `id`、`textId`、`modelId`、`modelVersion`、`manifestSha256`、`capability`、`params`、`mediaId`、`rangeStart`、`rangeEnd`、`startedAt`、`finishedAt`、`status`（`running | ok | error | cancelled`）、`errorCode`、`chunkCount`、`acceptedCount`、`rejectedCount`、`pendingCount`。这一程 `capability` 固定为 `transcribe`。
9. 结果一律是候选，由人接受或拒绝。待审候选不落库；面板关掉则 `pendingCount` 归零，记为放弃。拒绝只加 `rejectedCount`，不存正文。接受写进用户选定的转写层，不覆盖已有文字；已有文字时并排，由用户选。语段不新增字段。来源用已有 `provenance`：`actorType: 'ai'`，`model` / `modelVersion`，`confidence`，`params.modelRunId` 指向该行。逐条接受记 `reviewStatus: 'confirmed'`。按置信度阈值整批接受记 `reviewStatus: 'suggested'`。表和键名 `modelRunId` 随 D14 一起冻结。

## 影响

- #303 实现本篇的转写合同。候选面板、落库和一致性脚本是 #305 / #306，依赖桌面壳与 Electron 冒烟。
- SQLite 表结构（#275）纳入 `model_runs`。冻结前加不进，就用一次只加不改的迁移，不把运行记录写进 `source_records`。
- 本篇不开始桌面壳，也不改现有 Whisper 调用路径。

## 被放弃的备选方案

1. 用 `source_records` 记模型运行。
2. 对接 whisper.cpp 官方 `/inference`。
3. 把拒绝的候选正文留在项目里。
4. 这一程同时做命令行、进程内推理和远程地址。
5. 在语段上新增模型来源字段。
