---
title: 统一模型候选面板 + 模拟模型 + 自测脚本 + 1 条 e2e
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: []
execution_gate: second-stage
issue: https://github.com/Abe-Junwei/Jieyu/issues/306
---

# 统一模型候选面板 + 模拟模型 + 自测脚本 + 1 条 e2e


## 当前排期覆盖（2026-10-30，ADR-0098）

模型下载、持久管理、转码和随包分发移至第二程 #285，当前不做，不作为第一程 #250、单库 #275 或发布检查 #282 的前置。已完成的模拟/真实引擎开发闭环与人工采纳保留；默认关闭，不等于随包能力验收。下文较早的“挡首发”及整单依赖在这些余项上作废，见 [ADR-0098](../../../adr/0098-model-delivery-followups-in-second-stage.md)。

<!-- desktop-sqlite-slices:v1:start -->
## 当前可执行切片与关闭条件（2026-10-25 本轮重排）

归 M5-F：M4-C 通过且 #305 宿主接口/目标单库写入门禁就绪即可推进，不等 #305 或 #275/#325 整单关闭。

- [x] 模拟服务→转写候选面板→逐条人工采纳→重启读回；已有正文不覆盖，真实 Electron 证据已在 `ef3edf36`。
- [ ] 阈值批量、逐条拒绝计数与其他模型产品收口留后续模型队列，当前不做，不挡第一程。
- [ ] 运行记录含零产出/失败/取消；接受时正文、来源与运行计数同事务，失败全部回滚。
- [ ] 媒体秒按文稿映射换算；保存启动凭据，删除恢复后的旧任务不能写，新任务仍可写。
- [ ] 待审转写候选正文不落库，拒绝只计数；它不是 ADR-0089 的持久图建议/快照，不混用 accepted 历史规则。
- [ ] Electron 证据交 #275 M6-D 和 #282。本单原有 conformance/模拟模型范围保留。

若采纳触发已有分析失效，走 units.updateText 的内部原子逻辑，不由面板凑多次写入。


详细前置/验收见[单库切片清单](../../../execution/plans/desktop-project-sqlite-2026-10-25.md#可领取切片与交付顺序2026-10-25-本轮重排)。本轮同步不代表实现完成；下方较早范围保留，冲突以本节为准。
<!-- desktop-sqlite-slices:v1:end -->

## 2026-10-25 已确认范围

M4 后并在模型宿主 API 就绪时开工，不等 #275/#325 整单关闭；候选采纳同事务写新单库，已删除文稿/旧任务迟到结果不能写。 依据 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[ADR-0087](../../../adr/0087-project-deletion-retention-and-media-cleanup.md) 和[单库计划](../../../execution/plans/desktop-project-sqlite-2026-10-25.md)。GitHub 已于 2026-10-25 写入当前范围。以下原 Question 留作历史输入，冲突处按本节执行。

## Question

- 统一「模型候选」面板：按语段接受/拒绝，阈值批量接受；不覆盖人工内容。
- `model_runs` 落库（拒绝只计数、不存正文；待审候选不落库）。
- 模拟模型 `src/tools/mock-model-server` + conformance 自测脚本。
- 1 条 Electron e2e：配置模拟模型 → 转写 → 接受 → 重载后仍在。

接入转写页 / 标注页的首片范围、写入规则与不在首片的项，见 [#306](https://github.com/Abe-Junwei/Jieyu/issues/306) 正文与 [model-interface-plan.md](../model-interface-plan.md) §8–§9、§13。
