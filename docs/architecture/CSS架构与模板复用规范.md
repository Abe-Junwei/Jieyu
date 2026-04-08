---
title: CSS 架构与模板复用规范
doc_type: architecture-spec
status: active
owner: repo
last_reviewed: 2026-04-08
source_of_truth: css-architecture-governance
---

# CSS 架构与模板复用规范

## 1. 分层目录

- `src/styles/foundation/*`：基础原子和壳层，不允许放业务面板/页面规则。
- `src/styles/panels/*`：面板、弹窗、右侧栏等可复用业务容器。
- `src/styles/pages/*`：页面级布局与路由容器样式。

入口文件约束：
- `src/styles/app-foundation.css` 只允许导入 `global.css`、`foundation/*` 与 `pages/app-shell-layout.css`。
- `src/styles/transcription-entry.css` 只允许导入 `panel-blocks.css`、`ai-sidebar-entry.css`、`foundation/*`、`panels/*`、`pages/*`。

## 2. 命名规则

- 基础层：保留既有 `dialog-shell*` / `panel-*` 语义前缀。
- 新面板根类：`pnl-<domain>-panel`。
- 新对话框根类：`pnl-<domain>-dialog`。
- 组件内部块使用 `__`：`pnl-foo-panel__header`、`pnl-foo-panel__body`、`pnl-foo-panel__footer`。
- 状态类统一 `is-*`。

## 3. 样式治理基线

已接入检查脚本：
- `npm run check:css-inline-style`
- `npm run check:css-token-usage`
- `npm run check:css-dup-selectors`
- `npm run check:css-layer-boundary`
- `npm run check:css-architecture`

基线文件：
- `scripts/css-inline-style-baseline.json`
- `scripts/css-token-usage-baseline.json`
- `scripts/css-dup-selectors-baseline.json`

当完成阶段性清理后，运行以下命令刷新基线：

```bash
npm run check:css-inline-style:write-baseline
npm run check:css-token-usage:write-baseline
npm run check:css-dup-selectors:write-baseline
```

## 4. 自动模板

通过脚手架快速创建统一风格容器：

```bash
npm run scaffold:ui-surface -- --type=panel --name=SpeakerAudit
npm run scaffold:ui-surface -- --type=dialog --name=SpeakerAudit
```

脚手架将生成：
- `src/components/<Name>Panel.tsx` 或 `src/components/<Name>Dialog.tsx`
- `src/styles/panels/<name>-panel.css` 或 `src/styles/panels/<name>-dialog.css`

并自动套用统一区块结构（header/body/footer）和 token 化基础样式。
