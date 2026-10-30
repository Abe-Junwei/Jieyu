---
title: 本机 Whisper requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-10-30
source_of_truth: desktop-local-whisper-spec
---

# 本机 Whisper 第一条真实引擎闭环

> 2026-10-30 排期覆盖：已完成实现与验证保留，未完成的模型产品余项按 [ADR-0098](../../../adr/0098-model-delivery-followups-in-second-stage.md) 后移至第二程/后续模型队列，当前不实施，不阻塞第一程；不自动打开默认关闭入口。

承接已批准的 #303/#305 下一刀。只用合成输入，复用默认关闭的 desktopModelCandidatesEnabled，不动 DDL 或旧路由。

- [x] 自带 whisper-server 提供 v1 /health 与 multipart /transcribe，旧 OpenAI 端点继续兼容。
- [x] 只监听回环；拒绝远端 Host、Origin 与非回环连接，上传限长；请求不能指定任意权重或可执行文件。
- [x] CLI 使用参数数组；取消、超时、进程失败清理子进程和本次临时文件，不回传 stderr、路径或正文。
- [x] 主进程授权本地权重，哈希进入模型声明身份；服务仅当前会话有效，项目切换/退出停止。
- [x] 界面选本机 Whisper 后复用候选/人工采纳，真实 CLI+合成语音读回正文、来源与运行。
- [x] typecheck、定向回归、Chromium、真实 Electron、architecture、workflow、docs/i18n 验证。

本刀使用开发安装的 whisper-cli 和显式选择的本地权重。应用内下载/镜像/持久模型管理、随包引擎/动态库与签名仍未完成，不关闭 #303/#305。首发 Mac small / Windows base 的既定默认不由本刀更改；tiny 仅用于合成验收。安装/Windows/升级/真实垃圾箱仍后移。

未完成（整单剩余，非本切片验收）：

- [ ] 应用内下载/镜像/取消/断网与持久模型设置。
- [ ] 录音转码与随包引擎/动态库/签名。
- [ ] 默认关闭入口的一周自用、默认值决定和稳定周期收口。
