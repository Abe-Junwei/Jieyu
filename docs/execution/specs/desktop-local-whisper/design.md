---
title: 本机 Whisper design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-10-30
source_of_truth: desktop-local-whisper-spec
---

# 设计

## 1. 成熟方案扫描 / Research

- 既有 modelHost 已有 HTTP 校验/取消，projectTranscription 已有启动快照、PCM16 分块、内存候选和持久采纳；既有 whisperCliJson 提供 CLI 参数与 JSON 解析。全部复用，不另造运行时。
- whisper.cpp CLI 官方样例支持 WAV 与 JSON 输出；沿现有 -ojf 参数，不接官方 /inference。https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.9.5/examples/cli/README.md
- Node spawn 使用参数数组，无 shell；error/close/AbortSignal 各自清理，不能只杀 HTTP 连接而遗留推理。https://nodejs.org/api/child_process.html
- Node HTTP 文档：取消监视 response close；request close 也会在上传结束触发，不能拿它代表用户取消。停止服务先 close 再 closeAllConnections。https://nodejs.org/api/http.html
- 对比 Electron utilityProcess：它适合独立 Node 服务；已有服务仅协调一个 CLI，此刀在主进程内启动回环 HTTP 与原生 CLI 子进程，少一层打包/启动协议，仍经 ModelHost HTTP。https://www.electronjs.org/docs/latest/api/utility-process
- 反模式：renderer 提供可执行路径、上传字段选文件、把 stderr 回显、通配 CORS、共享可预测临时名。改用 main 环境配置/系统授权、固定权重、错误码、来源守卫和 mkdtemp。
- 无新增依赖；Whisper MIT，权重 MIT，真正随包动态库/签名和清单另刀核对，不据本机成功声明分发完成。

## 2. 落位与执行

- effect/actions：src/tools/whisper-server/whisperProcess.js 抽现有 CLI 执行，whisperV1.js 实现边界与 HTTP；server.js 保留旧接口并复用。
- effect/actions：src/desktop/localWhisper.ts 持有当前会话服务、生成已核哈希声明、关闭连接；只接受已登记 SHA-256 的官方 tiny/base/small 权重，私有快照避免运行中原文件变化；main/preload 只做授权接线，不向 renderer 暴露任意路径参数。
- derived：既有 PCM16 RIFF 解析移为同名 JS + d.ts，Node 独立服务与 TypeScript 宿主共用，不复制解析器。
- state/actions：已有 useDesktopModelCandidatesController 增一个选择本机模型动作；DesktopModelCandidates 只绑定按钮，无新 controller。
- 启动/关闭均做代际检查，异步哈希/监听完成后复核会话；取消选择不改变当前模型。换项目/退出停止服务和当前任务。
- 验证：npx vitest run src/tools/whisper-server src/desktop src/pages/DesktopModelCandidates.test.tsx；npm run typecheck、test:e2e:desktop-project、test:e2e:chromium、check:architecture-guard、check:agent-evals:smoke、check:docs-governance、check:dev-agent-workflow-verify。真实引擎仅合成语音，不读取用户材料。

## 3. 工程边界

当前仅匹配 16 kHz 单声道 PCM16 WAV，其他格式/采样率仍拒绝；重采样转码与应用内下载归下一刀。tiny 只用于合成验收，不更改 Mac small / Windows base 首发选择。权重目录/哈希来自 https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/main?recursive=false&expand=false ，公开 tiny 下载后校验为 be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21。

服务只在当前应用会话内持有；重开需重新选择，不冒充持久模型注册。默认关闭现有候选 flag，自用与稳定周期清开关沿原规格，不关闭 #303/#305。
