---
title: ADR 0123 - 开发服务器默认显示桌面外壳
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-18
source_of_truth: decision-record
depends_on:
  - ./0063-desktop-only-after-electron-skeleton.md
---

# ADR 0123：开发服务器默认显示桌面外壳

## 背景

[ADR-0063](./0063-desktop-only-after-electron-skeleton.md) 规定产品只做桌面版，浏览器构建只留作开发和测试。`vite dev` 仍把没有 `jieyuDesktop` 的浏览器送进旧网页页面，所以 `http://127.0.0.1:5199` 和 Electron 窗口不是同一套界面。

Chromium E2E 仍是 #329 完成前的合并门槛，旧网页页面还是这 55 个用例的对象。

## 决定

1. **没有桌面桥接时显示桌面外壳，不打开旧网页页面。** `resolveDesktopSurface` 在宿主不可用且不是 Electron 时返回 `unavailable`。主区只显示「请在解语桌面窗口中打开」。浏览器不提供假桥接，也不读旧库。
2. **旧网页页面只在测试构建里出现。** 构建变量 `VITE_LEGACY_WEB_SURFACE=true` 时才返回 `legacy`。`playwright.config.ts` 的 webServer、`.github/workflows/e2e-pr.yml` 的构建步骤，以及 `test:e2e:session-sidecar-audit` 设置这个变量。Electron 里即使带上这个变量也不进旧网页页面。
3. **开发期提示横条不属于桌面外壳。** 它只随旧网页测试构建出现。桌面窗口标题已经标明开发版。
4. **局部收窄 ADR-0063 第 2 条。** 浏览器构建仍供测试，`vite dev` 不再展示旧网页产品。第 1、3、4 条不变。#329 完成前 Chromium E2E 仍是合并门槛。

## 未选方案

- **在浏览器里做只读假桥接。** 合成项目会和 Electron 里的真实项目分叉，还要单独维护。
- **删掉旧网页页面。** Chromium E2E 还没迁走，现在删会拆掉合并门槛。

## 影响

- 打开 `vite dev` 的人看到的是桌面外壳加一句提示。项目内容只在 Electron 窗口里。
- 跑 Chromium E2E 的构建必须带上 `VITE_LEGACY_WEB_SURFACE=true`，否则用例会停在这句提示上。
