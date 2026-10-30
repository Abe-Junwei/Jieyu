---
title: 本机 Whisper tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-10-30
source_of_truth: desktop-local-whisper-spec
---

# 任务

> 2026-10-30 排期覆盖：已完成实现与验证保留，未完成的模型产品余项按 [ADR-0098](../../../adr/0098-model-delivery-followups-in-second-stage.md) 后移至第二程/后续模型队列，当前不实施，不阻塞第一程；不自动打开默认关闭入口。

- [x] Explore：核对旧包装/CLI/宿主/候选入口和 #303/#305 合同，复用现有默认关闭入口；Research 与具体落位已定。
- [x] 服务端 v1、Host/Origin/地址、multipart 和 PCM16 校验；取消/超时/临时文件生命周期反例。
- [x] 桌面本机权重授权、服务启动/切换/关闭与候选 UI。
- [x] 真实 CLI 合成输入、人工采纳与重开读回；定向与合并门禁。
- [x] 更新路线图和证据，保留下载/持久模型管理/随包分发/自用边界，不关闭整单。

## 验证与后续

- 真实引擎：Homebrew whisper-cli 1.9.4 + 公开 tiny（SHA-256 校验）+ macOS say 新生成的合成语音；领域写入/重开与 Electron 页面流程通过。
- 最终全域回归 150 文件通过、3 跳过；1094 用例通过、4 跳过。真实引擎/安全定向 24 项通过，typecheck、eslint 通过。
- Electron 8 通过、2 个后移平台用例跳过；Chromium 123 通过、1 个既有跳过。agent smoke 4/4；其他门禁与最终全域数字见会话 files/local-whisper-20261030/verification.md。
- 并行构建时三个原有测试触及 5 秒超时；降低并发、不改产品代码或超时设置的全域复跑通过。证据保留首次与复跑输出。
- 真实引擎测试需显式 WHISPER_CLI / JIEYU_WHISPER_REAL_MODEL / JIEYU_WHISPER_SYNTHETIC_AUDIO；普通回归明确跳过，不把未提供权重算通过。
- [ ] 应用内下载和持久模型管理、转码、随包分发/签名另刀实施；#303/#305 保持打开。
- [ ] 入口默认关闭，一周自用及稳定周期后清开关前保留规格。

复跑入口：

- `npm run typecheck`
- `npx vitest run src/db src/desktop src/pages/Desktop src/pages/useDesktop src/tools/whisper-server --maxWorkers=2`
- `npm run test:e2e:chromium`
- 显式设置 `WHISPER_CLI`、`JIEYU_WHISPER_REAL_MODEL`、`JIEYU_WHISPER_SYNTHETIC_AUDIO` 后运行 `npx vitest run src/desktop/localWhisper.real.test.ts` 与 `npm run test:e2e:desktop-project`。权重哈希见 `src/tools/whisper-server/desktopWhisperModels.json`；合成语音由 macOS `say` 新生成，再用 ffmpeg 转成 16 kHz 单声道 PCM16 WAV，不使用用户语料。
