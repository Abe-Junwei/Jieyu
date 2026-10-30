---
title: 桌面模拟模型候选闭环 requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-10-30
source_of_truth: desktop-model-candidates-spec
---

# 桌面模拟模型候选闭环

按已批准路线图下一刀接通宿主响应，不再要求手填候选。复用 ADR-0057/0094 和既有单库操作，不改 DDL。

- [x] 主进程通过系统选择框授权声明文件，模型身份和哈希由宿主读取；不接受渲染进程任意录音路径。
- [x] 选择当前文稿转写层及媒体范围，先保存运行和启动凭据，再调用本机模拟 HTTP 服务；按声明最大长度切块。
- [x] 先支持与声明匹配的 PCM16 WAV，真实引擎转码/下载归下一刀，不伪装支持其他格式。
- [x] 结果为内存候选，逐条预览和人工采纳走已有事务；重开读回正文、来源和计数。范围被占用不覆盖。
- [x] 映射、目标内容或生命周期在等待期间改变时拒绝迟到结果；会话切换不向新项目落候选。
- [x] 失败、取消、零产出和重启中断留运行事实；关闭候选记放弃，候选正文不写库或日志。
- [x] 新入口默认关闭；开启时可以选模型、运行、取消、查看/编辑候选、逐条采纳或放弃。
- [x] 领域/页面定向测试和真实 Electron 模拟服务流程通过；原 Chromium 门槛保留。

落位：src/desktop/projectTranscription.ts、transcriptionAudio.ts；src/pages/useDesktopModelCandidatesController.ts、DesktopModelCandidates.tsx；既有宿主/面板/main/preload/client/i18n；相关测试。

不关闭整个 #306：阈值批量与逐条拒绝计数不在本刀，仍按原单独立实施；不用放弃冒充拒绝。真实引擎、模型持久管理、真实材料及后移发布项不在本刀。
