---
title: 桌面试用版发布检查单（改写主路线图 C1）
label: wayfinder:task
mode: HITL
status: open
assignee:
blocked_by: [027,033]
issue: https://github.com/Abe-Junwei/Jieyu/issues/282
---

# 桌面试用版发布检查单（改写主路线图 C1）

## Question

把 [主路线图](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/plans/%E8%A7%A3%E8%AF%AD-%E4%B8%BB%E8%B7%AF%E7%BA%BF%E5%9B%BE-master-roadmap-2026-06-01.md) §3 Stage C 的 C1 与 [对外前最小检查](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/release-gates/%E5%AF%B9%E5%A4%96%E5%89%8D%E6%9C%80%E5%B0%8F%E6%A3%80%E6%9F%A5-2026-05-11.md) 改写成桌面试用版发布前检查单：隐私与导出范围说明、Electron 安装包的发布冒烟（替代 chromium e2e）、Sentry（#261）与发布流水线（#277）衔接。Agent 抽样门槛（C1 = A8+A9+A11+A14）是否仍要求，列出选项由用户逐项挑。只起草，不执行。

已定（用户 2026-10-13）硬门槛只有三条，其余项只记录不拦发布：
1. 不丢数据：写入后读回校验，升级前快照、覆盖前快照都在；反馈邮件按钮与诊断包导出可用（[#312](https://github.com/Abe-Junwei/Jieyu/issues/312)，用户 2026-10-14 定；Sentry 不挡）。
2. Mac（Apple 芯片）与 Windows x64 上能安装、启动、自动更新。
3. 用示例项目走通核心流程，含本机转写（[#303](https://github.com/Abe-Junwei/Jieyu/issues/303)–[#306](https://github.com/Abe-Junwei/Jieyu/issues/306) 挡首发，用户 2026-10-14 定）。

