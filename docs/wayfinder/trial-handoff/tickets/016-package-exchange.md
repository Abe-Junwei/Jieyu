---
title: 项目包互传的试用流程是否已够用
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: []
execution_gate: M6-package-api-ready
issue: https://github.com/Abe-Junwei/Jieyu/issues/266
---

# 项目包互传的试用流程是否已够用

等单库交换 API（M6-A）。不用当前旧包路径当验收。

## Question

用现有 JYM/JYT 导入导出，走一遍两人互传：A 导出→B 导入→B 修改→导出→A 导入。记录卡点、冲突处理表现、文件大小（含音频）与提示语问题，作为后续决策输入。只在盒子里本地操作。

已定的导入规则（核对时以此为准）：
- 同一 textId：默认导入为新项目；覆盖需二次确认，并先存覆盖前快照。
- 跨版本：新版应用自动升级旧包（原文件不动）；旧版应用拒绝新包并提示升级。

