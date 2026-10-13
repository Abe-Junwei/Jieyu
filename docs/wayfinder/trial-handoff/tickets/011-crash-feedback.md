---
title: 崩溃上报与反馈渠道
label: wayfinder:grilling
mode: HITL
status: closed (completed)
assignee:
blocked_by: [026]
issue: https://github.com/Abe-Junwei/Jieyu/issues/261
---

# 崩溃上报与反馈渠道

## Question

已接 Sentry（src/observability/sentry.ts，由 VITE_ENABLE_SENTRY/DSN 开关，有脱敏策略）。试用版是否开启？需要征得试用者同意吗、数据去哪（Sentry 自建/云）？试用者报问题走什么渠道（应用内按钮、邮件、微信群、GitHub）？

## Related

部分重叠：[主路线图](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/plans/%E8%A7%A3%E8%AF%AD-%E4%B8%BB%E8%B7%AF%E7%BA%BF%E5%9B%BE-master-roadmap-2026-06-01.md) C1 = [对外前最小检查](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/release-gates/%E5%AF%B9%E5%A4%96%E5%89%8D%E6%9C%80%E5%B0%8F%E6%A3%80%E6%9F%A5-2026-05-11.md)「数据与隐私」一节（Sentry 采样与脱敏）。本单另定是否开启、同意与反馈渠道。

## Resolution

用户 2026-10-13 定：自动崩溃上报默认关闭、由试用者选择开启（如 Sentry），脱敏按主路线图 C1「对外前最小检查」执行。
