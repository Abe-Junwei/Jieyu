---
title: 发布流水线：Mac 签名公证、Windows 暂不签名、GitHub Releases
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [025,026,043]
issue: https://github.com/Abe-Junwei/Jieyu/issues/277
---

# 发布流水线：Mac 签名公证、Windows 暂不签名、GitHub Releases

## Question

用户已定：Mac 签名并公证，Windows 暂不签名；用 electron-updater 走 GitHub Releases 自动更新。CI 如何出包、证书和公证凭据放哪（CI 机密）、版本号与 release-gates 怎么接、Windows SmartScreen 放行步骤写进手册（#263）。
