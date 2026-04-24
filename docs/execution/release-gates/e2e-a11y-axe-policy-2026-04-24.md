---
title: E2E 可访问性（Axe）门禁策略
doc_type: execution-release-gates
status: active
owner: repo
last_reviewed: 2026-04-24
source_of_truth: e2e-a11y-axe-policy
---

# E2E 可访问性（Axe）门禁策略

## 目的

在 CI 的 Playwright 任务中（`npm run test:e2e:chromium` / `npm run test:e2e`）用 `@axe-core/playwright` 对**稳定、自有 UI 子树**做回归，避免整页扫描被第三方脚本或动态内容放大为 flake。

## 规格与严重级别

- **实现文件**：`tests/e2e/a11ySmoke.spec.ts`。
- **规则集**：Axe 默认规则（与 `@axe-core/playwright` 内置 `analyze()` 一致）。
- **CI 门槛**：每个用例返回的 **`violations` 数组必须为空**。任意一条 violation 即失败；不按「仅 serious/critical」降级——与 Axe 返回结构一致，避免与自定义严重度映射漂移。
- **范围（`AxeBuilder.include`）**：
  - 首页 `/`：`nav` 与 `main` 均在 **`locator` 可见**（各最长 15s）后再 `include` 扫描，避免壳层异步挂载导致「include 无匹配」flake。
  - 转写页 `/transcription`：在 `transcription-workspace-screen` 可见后，对 `[data-testid="transcription-workspace-screen"]` 与 `.left-rail-project-hub-root` 扫描。

## 与「关键路径」E2E 的关系

`a11ySmoke` 与 `criticalPaths` 同属 `tests/e2e/`，由同一 Playwright 配置与 `test:e2e*` 脚本执行；不单独拆 job，除非后续将 a11y 从默认 e2e 中拆出并在此文档更新命令与 CI 矩阵。

## 维护说明

扩大 `include` 前确认选择器在 Chromium/Firefox/WebKit 下稳定；若某区域持续误报，优先修 UI/ARIA，其次再收窄扫描范围并在此文档记录原因。
