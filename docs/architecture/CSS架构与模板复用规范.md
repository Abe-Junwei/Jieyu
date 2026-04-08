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

## 5. 三阶段统一优化方案（含成熟规范补齐）

本节将既有 CSS 治理项与新增六项成熟规范能力合并为一条路线，避免“规则、测试、迁移”三套节奏分离。

### Phase 1：基线收敛与风险止血（1-2 周）

目标：先消除高风险写法，补齐最小可用门禁，保证后续重构可控。

范围：
- 替换所有 `transition: all` 为属性白名单。
- 建立统一 `prefers-reduced-motion` 降级策略，覆盖无限动画与关键过渡。
- 将路由级大 CSS 分片纳入 build budget（不仅是 `index.css`）。
- 接入 `stylelint`（先 warning 模式），固化基础规则：命名、层级、特异性、禁用属性。
- 发布浏览器支持矩阵 v1（含 `color-mix`、`field-sizing`、`backdrop-filter` 的降级策略说明）。

新增门禁：
- `npm run check:css-motion-accessibility`（新增）
- `npm run lint:css`（新增，stylelint warning 起步）
- `npm run check:build-budgets`

退出标准：
- `transition: all` 数量为 0。
- `prefers-reduced-motion` 覆盖所有 `animation: * infinite` 场景。
- 路由 CSS 超预算可被 CI 直接阻断。

### Phase 2：规则强制与自动化回归（2-4 周）

目标：把“人工约定”升级为“自动化约束”，降低回归概率。

范围：
- `stylelint` 从 warning 提升到 error，纳入 `npm test` 前置链路。
- 接入可访问性自动化检查（焦点可见性、对比度、键盘可达、reduce-motion 行为）。
- 接入视觉回归测试（关键页面和弹窗快照基线）。
- 扩展 token 治理：语义层级（global/alias/component）和新增 token 评审规则。
- 对现代特性补齐 `@supports`/fallback 检查脚本，避免“使用了特性但未声明降级”。
- 建立样式废弃登记（deprecated class registry），开始双轨迁移管理。

新增门禁：
- `npm run check:css-a11y`（新增）
- `npm run test:visual-css`（新增）
- `npm run check:css-compat`（新增）
- `npm run check:css-token-governance`（增强）

退出标准：
- 新增样式必须通过 stylelint error 规则。
- 关键页面视觉快照在 CI 稳定通过。
- 新增 token、新增兼容性特性均有治理记录与自动检查。

### Phase 3：体系化清算与长期治理（4-8 周）

目标：完成历史包袱清理，使规范进入“可持续演进”状态。

范围：
- 按域完成命名收敛到 `pnl-*` 体系（新代码 100%，存量分批迁移）。
- 上线 AST 级“未使用选择器”扫描，持续清理死代码与重复选择器。
- 将废弃类名按窗口期移除，关闭双轨兼容。
- 完成 token 分层收口并冻结旧 token 入口。
- 形成季度治理节奏：预算复盘、兼容矩阵复核、视觉基线更新。

新增门禁：
- `npm run check:css-unused-selectors`（新增，先 report 后 strict）
- `npm run check:css-naming-convention`（新增）
- `npm run check:css-deprecation-window`（新增）

退出标准：
- `pnl-*` 成为新增样式唯一根命名体系。
- 未使用选择器数量持续下降并可追踪。
- 废弃类清单维持净减少，迁移窗口按计划关闭。

## 6. 六项成熟规范能力与 Phase 映射

1. 规则体系标准化（stylelint）
	- Phase 1 接入，Phase 2 强制，Phase 3 作为长期门禁维护。
2. 可访问性自动化
	- Phase 1 完成 motion 基线，Phase 2 扩展到完整 a11y 自动化。
3. 视觉回归测试
	- Phase 2 接入关键路径，Phase 3 固化季度基线更新机制。
4. 兼容性策略显式化
	- Phase 1 发布矩阵与策略，Phase 2 建立兼容性检查脚本，Phase 3 持续复核。
5. 设计 Token 治理深化
	- Phase 2 建立语义层级与评审规则，Phase 3 完成旧入口收口。
6. 废弃与迁移机制
	- Phase 2 建立 deprecated registry，Phase 3 执行窗口期下线与清算。

## 7. CI 必过检查清单（CSS 治理）

以下检查应作为 CSS 治理的默认必过项，统一由 `quality` 作业的 `npm test` 链路承载。

### 7.1 Job 层必过上下文

1. `docs-governance`
2. `quality`
3. `build-guard`

说明：`quality` 已串联 CSS 相关门禁；`build-guard` 负责构建预算与产物体积约束。

### 7.2 CSS 门禁命令清单（由 `npm test` 触发）

1. `npm run lint:css`
2. `npm run check:css`
3. `npm run check:css-architecture`
4. `npm run check:css-a11y`
5. `npm run check:css-naming-convention`
6. `npm run check:css-unused-selectors`
7. `npm run check:css-deprecation-window`
8. `npm run test:visual-css`

### 7.3 Build 预算门禁（由 `build-guard` 触发）

1. `npm run build`
2. `npm run profile:build-assets`
3. `npm run check:build-budgets`

### 7.4 分支保护建议

配置 `scripts/configure-github-branch-protection.mjs` 时，至少应包含以下 required checks：

1. `docs-governance`
2. `quality`
3. `build-guard`
