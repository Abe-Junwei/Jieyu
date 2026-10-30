---
title: 桌面模拟模型候选闭环 design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-10-30
source_of_truth: desktop-model-candidates-spec
depends_on:
  - ./requirements.md
---

# 设计

## 1. 成熟方案扫描 / Research

- 既有 modelHost 提供声明校验、回环 HTTP、大小限制与 AbortController；modelRuns 提供运行、预览、事务采纳和放弃。全部复用。
- Electron 官方 IPC 示例采用 preload 具名 invoke/handle 与原生选择框；模型声明由 main 授权，不给 renderer 通用读文件入口：https://www.electronjs.org/docs/latest/tutorial/ipc。
- SQLite ACID 保证一次事务内全成败，不覆盖外部 HTTP 等待；运行启动与响应完成为独立短事务，不在事务里 await：https://www.sqlite.org/transactional.html。
- Microsoft RIFF 规范说明 WAV 的 fmt/data chunks 及 WORD 对齐；按 chunk 读取 PCM16 并生成规范分块 WAV，不假设固定 data 偏移：https://learn.microsoft.com/en-us/windows/win32/xaudio2/resource-interchange-file-format--riff-。
- 反模式：让 renderer 回传任意本地录音路径、响应后取新凭据、把待审正文存入诊断、在库事务里等 HTTP。分别用当前会话授权、启动快照、内存候选、短事务避免。
- 资源上限：源 PCM16 WAV 64 MiB；整次最多 10,000 分块/候选，候选正文合计 8 MiB，超限留失败运行且不发布部分候选。
- 决定为适配既有模块和 Node Buffer，无新依赖。首刀拒绝未支持格式，转码归真实引擎片；不引入通用任务框架。

## 2. 分层与落位

- effect/actions：projectTranscription 主进程协调声明授权、读取当前录音、运行、取消和完成；不复用智能体运行时。
- derived：transcriptionAudio 验证 PCM16 WAV，裁出每块，时间保持媒体绝对秒。
- state/actions：useDesktopModelCandidatesController 持有候选与预览凭据，隔离 session/manuscript/layer，取消/卸载不污染新上下文；<300 行、<12 hooks。
- rendering：DesktopModelCandidates 只显示与绑定；既有 DesktopTranscriptionAcceptPanel 在 flag 开时装配新流程，关闭时保留旧行为。
- 主进程 start/finish 复用 modelRuns；新增只读目标快照复用其指纹计算，启动记录与目标快照同一短事务。完成时先比对，不能换新凭据。
- 一次人工采纳仍是现有具名操作的一次事务/IPC；完成写入才移出内存候选。
- 会话首次实际打开时中断遗留 running 记录；新 UI 卸载放弃其待审候选，不读取旧候选正文。

## 3. 范围与回退

无 schema 变化、无真实引擎/材料、无通用脚本写入口。desktopModelCandidatesEnabled 默认 false，VITE_DESKTOP_MODEL_CANDIDATES_ENABLED 显式开启；自用一周评估默认，稳定周期后清理。记录为新能力，不能沿用已删除的数据库重构规格。

## 4. 验证

先用真实临时库与本机模拟 HTTP 服务写失败测试，再实现；覆盖成功采纳与重开、失败/取消/零产出、目标变化/映射/删除恢复、会话切换、重复点击。跑 typecheck、vitest、Chromium、Electron 项目流程、architecture、格式冻结、agent full、workflow/docs/i18n。使用合成 PCM16 WAV；不以 mock 调用次数代替落库结果。
