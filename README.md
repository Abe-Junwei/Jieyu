# 解语 (Jieyu)

解语（Jieyu）是一个面向濒危语言研究与协作的本地优先应用。

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

## 构建

1. 生产构建

```bash
npm run build
```

2. 带预算与产物分析的构建校验

```bash
npm run build:guard
```

## 主要入口

- 应用启动入口：[src/main.tsx](src/main.tsx)
- 应用壳层与路由：[src/App.tsx](src/App.tsx)
- 主转写工作区入口：[src/pages/TranscriptionPage.tsx](src/pages/TranscriptionPage.tsx)
- 语言资产服务门面：[src/services/LinguisticService.ts](src/services/LinguisticService.ts)
- 数据库与迁移：[src/db/index.ts](src/db/index.ts)

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
