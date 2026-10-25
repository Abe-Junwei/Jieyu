---
title: 冻结前清单：D14 冻结磁盘项目文件夹格式
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [008,025,030,043]
execution_gate: M6-integration-and-deletion-complete
issue: https://github.com/Abe-Junwei/Jieyu/issues/259
---

# 冻结前清单：D14 冻结项目文件夹格式


<!-- desktop-sqlite-slices:v1:start -->
## 当前可执行切片与关闭条件（2026-10-25 本轮重排）

本单是 M7-A 格式冻结，不能在 M1 或 M4 提前关闭。

- [ ] #275 M6-D 首发单库集成终验通过。
- [ ] #325 D1–D4 删除恢复及录音收尾全部通过。
- [ ] #258 含音频恢复另一文件夹后能播放，#280 真实领域/后台接替证据齐。
- [ ] 实际首发表集和约束稳定，必要领域列清单齐；冻结实际 DDL、格式版本及拒绝规则，代码/检查/提交可追溯。
- [ ] 按既有流程确认冻结，之后 #282 真实示例最终试用和发布验收。

不等待已关闭 not planned 的 #281/#326。开发期仅可重建合成项目，不做开发格式迁移器；旧数据不清理。#303/#305/#306 的工程集成与 #313-B 合成导入验证在冻结前，D14 后用户的真实示例最终试用不反向卡住冻结。#260/#304 已关闭的历史决定证据保留。


详细前置/验收见[单库切片清单](../../../execution/plans/desktop-project-sqlite-2026-10-25.md#可领取切片与交付顺序2026-10-25-本轮重排)。本轮同步不代表实现完成；下方较早范围保留，冲突以本节为准。
<!-- desktop-sqlite-slices:v1:end -->

## 2026-10-25 已确认范围

#275/#325、必要恢复/实际接替验收与首发表集稳定后才做 D14；取消 #281 本次演练和 #326 迁入的阻塞。开发期仅用受控合成项目，按新 ADR 改结构后重建，不实现开发文件迁移器。 依据 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[ADR-0087](../../../adr/0087-project-deletion-retention-and-media-cleanup.md) 和[单库计划](../../../execution/plans/desktop-project-sqlite-2026-10-25.md)。GitHub 已于 2026-10-25 写入当前范围。以下原 Question 留作历史输入，冲突处按本节执行。

## Question

2026-10-16 更新：D14 尚未冻结，也不能靠改文档完成。冻结对象不再是「SQLite + media/」。一份文稿同时只关联一条音频，父子链接不能跨文稿。冻结前要有格式原型、从含音频的备份恢复并播放、桌面写路径验证。本机已经导入过录音；能不能丢弃，要逐项盘点并由用户确认，不能用「没有要保留的真实数据」。哪一条决定现在有效，见 [ADR 目录](../../../adr/README.md)。

原先已定、现已不够：D14 在第一个试用版发布之前冻结，冻结对象曾写成项目文件夹格式（SQLite + media/）（[ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md) 第 8 条）。剩下仍要定：冻结前必须先合进 main 的在途改动（[#260](https://github.com/Abe-Junwei/Jieyu/issues/260)）、冻结前的加法迁移演练（[#281](https://github.com/Abe-Junwei/Jieyu/issues/281)）、版本号、谁确认、现有冻结检查（schemaFreeze.ts）如何扩到 SQLite 格式。

冻结前四项各归哪张单子（2026-10-16）：格式原型与跨录音文稿的迁移对拍已有合成版（规格已按 ADR-0051 删除，记录在 git 历史），剩下的列形状在 [025](025-folder-format.md)；含音频的恢复播放在 [008](008-backup-restore.md)；桌面写路径在 [043](043-desktop-file-ops.md)。旧浏览器库迁入（#326）已取消，不是冻结条件。

## Related

验证记录已从工作区移除。本单仍只定冻结时机与清单。
