---
title: 桌面模拟模型候选闭环 tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-10-30
source_of_truth: desktop-model-candidates-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# 任务

- [x] 核对已批准下一刀、ADR、宿主/模型运行/桌面面板调用链；完成 Research 与落位。
- [x] 主进程与真实库/模拟 HTTP 成功和失败反例，PCM16 分块及启动凭据校验。
- [x] 授权声明选择、会话限定运行/取消和重启恢复。
- [x] controller 与面板，内存候选、预览/采纳/放弃、上下文切换保护。
- [x] 默认关闭 flag、i18n 与页面回归。
- [x] Electron 模拟服务完整路径，采纳后重开读回及失败路径。
- [x] typecheck、定向/全域回归、Chromium、格式冻结、architecture、agent full、workflow、docs/i18n。
- [x] 更新路线图，保持原 #306 阈值批量/拒绝计数与真实引擎/发布范围边界。
- [ ] 一周自用及后续稳定周期 flag 收口；未完成前保留规格。

## 当次证据（2026-10-30）

- 全域回归：145 文件通过、2 跳过；1072 用例通过、3 个既有跳过。新增定向 11 项通过；typecheck 与触及 src/ /脚本 eslint 通过。
- 定向测试：真实库/HTTP、PCM16 RIFF、界面采纳响应丢失重试；迟到映射/正文/删除恢复/换项目、源文件失败和跨块候选总量限制均有反例。
- 真实 Electron：模拟 HTTP→候选→人工采纳→关闭重开；零产出/失败/取消/遗留 running 恢复一并检查。7 通过，2 个安装/真实垃圾箱后移用例跳过；不是包内新能力验收。
- Chromium 123 通过、1 个既有跳过；agent full 18/18，其他当次门禁与全域数字见会话 files/model-candidates-20261030/verification.md。
- 当前交付默认关闭，不含真实引擎或模型下载；旧 DMG 不包含本刀，不用其前轮证据冒充本刀包验收。
- 原 #306 的阈值批量与逐条拒绝计数仍未完成；本规格完成实现与工程验证部分，自用和开关收口仍未勾，不删除。
