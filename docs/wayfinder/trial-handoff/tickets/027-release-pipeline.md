---
title: 发布流水线：Mac 签名公证、Windows 暂不签名、GitHub Releases
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [026]
execution_gate: M4
issue: https://github.com/Abe-Junwei/Jieyu/issues/277
---

# 发布流水线：Mac 签名公证、Windows 暂不签名、GitHub Releases

## 2026-10-25 已确认范围

M4 通过后按白名单开工，不再等 #275/#325 整单终验；本单验收安装、签名/公证、发布更新，#282 汇集发布证据，#275 不包含这些独立发布实现。 依据 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[ADR-0087](../../../adr/0087-project-deletion-retention-and-media-cleanup.md) 和[单库计划](../../../execution/plans/desktop-project-sqlite-2026-10-25.md)。GitHub 已于 2026-10-25 写入当前范围。以下原 Question 留作历史输入，冲突处按本节执行。

## Question

用户已定：Mac 签名并公证，Windows 暂不签名；用 electron-updater 走 GitHub Releases 自动更新。CI 如何出包、证书和公证凭据放哪（CI 机密）、版本号与 release-gates 怎么接、Windows SmartScreen 放行步骤写进手册（#263）。
