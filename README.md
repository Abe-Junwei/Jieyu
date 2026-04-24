# 解语 (Jieyu)

解语（Jieyu）是一个面向濒危语言研究与协作的本地优先应用。

协作流程、Node 版本与常用门禁命令见 **[CONTRIBUTING.md](CONTRIBUTING.md)**。

## 启动

1. 安装依赖

```bash
npm install
```

2. 启动开发环境

```bash
npm run dev
```

## 测试

1. 类型检查

```bash
npm run typecheck
```

2. 全量测试与守卫

```bash
npm test
```

3. 聚焦页面或模块测试

```bash
npx vitest run <file-or-pattern>
```

## 浏览器与发版前核验

- **桌面策略**：[docs/architecture/桌面端浏览器支持策略.md](docs/architecture/桌面端浏览器支持策略.md)（四大 + 国内极速模式、Safari 门槛、ESR 等）。
- **CSS `backdrop-filter` 按文件门禁**：`npm run check:css-compat`（亦包含在 `npm run check:css-architecture` 与 CI `quality` 任务中，且 CI 在完整 `npm test` 前会先跑一遍以便早失败）。
- **国内双核手工冒烟**：[docs/execution/release-gates/桌面浏览器抽样验收-2026-04-24.md](docs/execution/release-gates/桌面浏览器抽样验收-2026-04-24.md)（CI 不替代）。
- **升级 Zod / Vite 或动到 CSP / `index.html` 脚本顺序后**：本地跑 `npm run regression:vite-zod-csp`（`typecheck` + `build` + 三引擎 E2E）；细节见 [ADR 0021](docs/adr/0021-zod-jitless-strict-csp.md)。

## 构建

1. 生产构建

```bash
npm run build
```

2. 带预算与产物分析的构建校验

```bash
npm run build:guard
```

## 地图代理（可选）

为减少前端暴露第三方地图 Key，可配置代理基址：

```bash
VITE_MAP_PROXY_BASE_URL=https://your-gateway.example.com/maps
```

可选降级开关（默认开启）：

```bash
VITE_MAP_PROXY_FALLBACK_ON_ERROR=true
```

当代理模式下 MapTiler 地理编码请求失败时，会自动回退到直连 Nominatim；
如需严格仅走代理，可设置为 `false`。

启用后：

- MapTiler 样式与地理编码请求优先走代理端点，不在 URL 中暴露前端 Key。
- Nominatim 正反向地理编码同样优先走代理端点（便于统一限流与审计）。
- 未配置该变量时，自动回退到原有直连模式。

当前前端约定的代理路径：

- `/maptiler/maps/:styleId/style.json`
- `/maptiler/geocoding/:queryOrLngLat.json`
- `/nominatim/search`
- `/nominatim/reverse`

## 主要入口

- 应用启动入口：[src/main.tsx](src/main.tsx)
- 应用壳层与路由：[src/App.tsx](src/App.tsx)
- 主转写工作区入口：[src/pages/TranscriptionPage.tsx](src/pages/TranscriptionPage.tsx)
- 语言资产服务门面：[src/services/LinguisticService.ts](src/services/LinguisticService.ts)
- 数据库与迁移：[src/db/index.ts](src/db/index.ts)

## 许可证与版本

- 许可证：[LICENSE](LICENSE)（ISC，与 `package.json` 的 `license` 字段一致）。
- 变更记录：[CHANGELOG.md](CHANGELOG.md)。
- 语义化版本约定：[docs/development/VERSIONING.md](docs/development/VERSIONING.md)。

## 文档索引

- 文档总索引：[docs/README.md](docs/README.md)
- 长期有效现状文档：[docs/architecture/README.md](docs/architecture/README.md)
- 执行、门禁与审计入口：[docs/execution/README.md](docs/execution/README.md)
- ADR 入口：[docs/adr/README.md](docs/adr/README.md)

文档分层约定：

- `docs/architecture/`：长期有效的当前现状、术语、协议与结构文档。
- `docs/规划-*`：历史规划文档，只保留当时方案与背景，不再作为当前事实源。
- `docs/发布说明-*`：每轮收口的发布记录。
- `docs/adr/`：已启用的关键技术决策目录。

常用文档治理命令：

- `npm run check:docs-governance`：检查当前受治理文档面的 frontmatter、角色声明与关键链接。
- `npm run report:docs-link-debt`：报告全仓历史文档链接债务，不阻塞本地或 CI 执行。
