---
title: 桌面试用版发布检查单（改写主路线图 C1）
label: wayfinder:task
mode: HITL
status: open
assignee:
blocked_by: [009,027,035,037,038,040,041]
issue: https://github.com/Abe-Junwei/Jieyu/issues/282
---

# 桌面试用版发布检查单（改写主路线图 C1）


<!-- desktop-sqlite-slices:v1:start -->
## 当前可执行切片与关闭条件（2026-10-25 本轮重排）

本单是 M7-B 发布终验，不把单库 M1 或文档检查当作发布就绪。

- [ ] M7-A/#259 已冻结，#275/#325 与必要恢复/接替的证据可追溯。
- [ ] 不丢数据：原子写入/读回、失败回滚、删除恢复、含音频备份恢复，#312 反馈邮件与诊断包可用。Sentry 不新增首发阻塞。
- [ ] #277：Mac Apple 芯片、Windows x64 真机安装/启动/自动更新通过，签名/公证及发布证据齐。
- [ ] #303/#305/#306：含本机转写的核心流程通过；#313-B 工程合成等价验证先做，D14 后由用户完成真实示例最终试用。代理不读/上传/粘贴真实语料。
- [ ] 三硬门槛齐，才按发布流程交付；本单不吞并各子单实现。

#311/#333/#299 在 M4 后可做但不挡首发；#298/B7 仍第二程。#281/#326 保持取消，不再要求演练/迁入或授权删旧数据。

2026-10-29：打包配置已核对，检查是 `npm run check:install-targets`。Mac arm64、Windows x64、GitHub 发布写在 `electron-builder.yml`。应用里没有更新器，CI 不出安装包。真机安装和真实示例未做。上面的框不勾。#282/#277 仍开着。


详细前置/验收见[单库切片清单](../../../execution/plans/desktop-project-sqlite-2026-10-25.md#可领取切片与交付顺序2026-10-25-本轮重排)。本轮同步不代表实现完成；下方较早范围保留，冲突以本节为准。
<!-- desktop-sqlite-slices:v1:end -->

## 2026-10-25 已确认范围

取消 #326 迁入门槛；#281 本次演练也不再阻塞 D14。仍须 D14、#277 安装更新、#312 反馈及示例核心流程含本机转写的证据。#275 只验收单库集成，不吞并发布验收；#311/#333/#299 可提前但不挡首发。 依据 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[ADR-0087](../../../adr/0087-project-deletion-retention-and-media-cleanup.md) 和[单库计划](../../../execution/plans/desktop-project-sqlite-2026-10-25.md)。GitHub 已于 2026-10-25 写入当前范围。以下原 Question 留作历史输入，冲突处按本节执行。

## Question

把 [主路线图](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/plans/%E8%A7%A3%E8%AF%AD-%E4%B8%BB%E8%B7%AF%E7%BA%BF%E5%9B%BE-master-roadmap-2026-06-01.md) §3 Stage C 的 C1 收成桌面试用版发布前检查单：隐私与导出范围说明、Electron 安装包的发布冒烟（替代 chromium e2e）、Sentry（#261）与发布流水线（#277）衔接。旧的浏览器口径检查单已从工作区删除。Agent 抽样门槛（C1 = A8+A9+A11+A14）是否仍要求，列出选项由用户逐项挑。只起草，不执行。

已定（用户 2026-10-13）硬门槛只有三条，其余项只记录不拦发布：
1. 不丢数据：写入后读回校验，升级前快照、覆盖前快照都在；反馈邮件按钮与诊断包导出可用（[#312](https://github.com/Abe-Junwei/Jieyu/issues/312)，用户 2026-10-14 定；Sentry 不挡）；旧浏览器库能经 JYB 迁入桌面项目文件夹（[#326](https://github.com/Abe-Junwei/Jieyu/issues/326)，用户 2026-10-17 定）。
2. Mac（Apple 芯片）与 Windows x64 上能安装、启动、自动更新。
3. 用示例项目走通核心流程，含本机转写（[#303](https://github.com/Abe-Junwei/Jieyu/issues/303)–[#306](https://github.com/Abe-Junwei/Jieyu/issues/306) 挡首发）；示例 = 木雅语 JYM（[#313](https://github.com/Abe-Junwei/Jieyu/issues/313)，用户 2026-10-14 定）。

