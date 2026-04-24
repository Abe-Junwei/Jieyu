# 参与解语（Jieyu）开发

## 环境

- **Node**：与 `[.github/workflows/ci.yml](.github/workflows/ci.yml)` 一致，使用 **Node 22**（仓库根目录 `[.nvmrc](.nvmrc)`）。
- **包管理**：`npm ci`（CI 同款锁文件安装）。

```bash
nvm use   # 若使用 nvm，会读取 .nvmrc
npm ci
```

## 常用命令


| 命令                              | 说明                        |
| ------------------------------- | ------------------------- |
| `npm run dev`                   | 本地开发                      |
| `npm run typecheck`             | TypeScript 检查             |
| `npm test`                      | Vitest 单元测试               |
| `npm run build`                 | 生产构建                      |
| `npm run test:e2e`              | Playwright E2E            |
| `npm run check:docs-governance` | 文档放置与链接治理（改 `docs/` 后建议跑） |


门禁类脚本见 `package.json` 中 `gate:*`、`check:*`；合并前以 **CI `quality` job** 与分支保护为准。

## Git hooks（`husky`）

`npm ci` / `npm install` 会通过 `prepare` 脚本安装 **`.husky/pre-commit`**。提交前会运行：

- `lint-staged`（`[lint-staged.config.mjs](lint-staged.config.mjs)`：暂存 `src/styles/**/*.css` 时跑 `stylelint --fix`；暂存 `src/**/*.ts|tsx` 时跑**全量** `npm run typecheck`，与 CI `quality` 一致）
- `npm run check:i18n-hardcoded:changed`
- `npm run check:translation-host-link-ssot:changed`

若需跳过（仅限应急）：`HUSKY=0 git commit …`。仓库**无** ESLint / Prettier 的 staged 管道；`lint-staged` 以 Stylelint 与全量 `typecheck` 与 CI 互补，**不**替代 `npm test` 与 E2E。

## 分支与合并

- 默认工作分支以团队约定为准（常见为 `main` / `dev`）。
- PR 描述与自检项见 `[.github/pull_request_template.md](.github/pull_request_template.md)`。

## 架构与产品事实源

- 长期架构与决策：`docs/architecture/`、`docs/adr/`。
- 执行计划与审计：`docs/execution/plans/`、`docs/execution/audits/`。

## PWA / 离线（本地验证）

- 生产构建后由 `vite-plugin-pwa` 生成 Service Worker；开发默认不启用 SW。
- 需要本地测 SW 时：`DEV_PWA=1 npm run dev`。

更多背景见 `[docs/execution/audits/工程审计勘误与全面修复计划-2026-04-24.md](docs/execution/audits/工程审计勘误与全面修复计划-2026-04-24.md)`。