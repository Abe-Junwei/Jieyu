---
title: '0047 — 桌面构建：剔除协作、密钥走钥匙串、遥测需同意'
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-13
source_of_truth: decision
---

# 0047 — 桌面构建：剔除协作、密钥走钥匙串、遥测需同意

- 状态：已接受（用户 2026-10-13 19:33–19:51 拍板）
- 相关：ADR-0046、ADR-0031（keyVault）、ADR-0021（CSP）、主路线图 C1、rev5 D5–D7。

## 决策

1. **协作。** 桌面构建在编译期剔除协作 / Supabase 代码；磁盘格式不含协作字段。试用项目一律视为「从未协作」，所以覆盖导入始终允许，但先存覆盖前快照。
2. **密钥。** keyVault 只在浏览器构建里用。桌面版密钥存系统钥匙串，AI 请求从 Electron 主进程发出。偏好备份不含密钥。桌面渲染进程的 CSP `connect-src` 只放行本地来源。
3. **崩溃上报。** 首次启动弹窗征求同意，默认关闭。渲染进程与主进程都接 `@sentry/electron`；强制 `sendDefaultPii = false`，事件字段按白名单；使用用户本人的 Sentry 账户与 DSN。
