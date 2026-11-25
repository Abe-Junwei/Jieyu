---
title: desktop-cli-readonly tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-11-25
source_of_truth: desktop-cli-readonly-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — desktop-cli-readonly

> 排期：完整实施（含 spike）排在 1c 之后，不插进 1b／1c。

## Implementation tasks

- [ ] Spike：关闭 `runAsNode` 后主进程无窗口模式在 macOS／Windows 打包版的终端输出、退出码、Dock 图标和启动耗时；确认仓库无 `child_process.fork` 依赖；结论写回 design §2 → 验证：两平台记录
- [ ] `electron/techLog.ts`：electron-log 文件通道、5MB×3 轮转、结构化字段白名单；`runContract` 外层打点 → 验证：`npx vitest run electron/techLog.test.ts`（哨兵断言）
- [ ] `readOnlyProject.ts`：取锁、库头与版本核对、`readonly` 连接、释放 → 验证：`npx vitest run src/db/desktop/readOnlyProject.test.ts`（34 版本库、缺库，字节哈希不变）
- [ ] `projectDoctor.ts`：版本、库头、`integrity_check`、`foreign_key_check`、孤儿备注 → 验证：`npx vitest run src/db/desktop/projectDoctor.test.ts`
- [ ] 语言偏好同步：渲染进程把 `jieyu.locale` 经 IPC 写到用户数据目录；CLI 读取与回退 → 验证：`npx vitest run src/desktop/cli`
- [ ] `runCli.ts`、`output.ts`：`util.parseArgs`、退出码、`--json` 带 `schemaVersion`、字典文案 → 验证：同上
- [ ] `commands.ts`：`inspect`、`doctor`、`export`、`diagnose`（单 JSON、预览后 `--out`） → 验证：同上，哨兵夹具
- [ ] `main.ts` CLI 分支与开关；占用时退出码 3 → 验证：`npx vitest run src/desktop/cli/cli.process.test.ts`
- [ ] 打包：关闭 `runAsNode` fuse；Windows 安装器 PATH 勾选；必要时小启动器 → 验证：两平台打包验收
- [ ] `electron/cliInstall.ts` 与 macOS 菜单「安装／卸载 jieyu 命令」 → 验证：macOS 打包版手工验收

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] 上述 vitest 路径
- [x] 不适用：不触及交互页面、ReadyWorkspace、侧栏、时间轴，不跑 `test:e2e:chromium`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:i18n-hardcoded`
- [x] 不适用：不触及 `src/ai/**`
- [ ] `npm run check:docs-governance`
- [ ] 开关 `JIEYU_DESKTOP_CLI` 默认关

## Commit 阶段证据模板

```
<title imperative ≤ 72 chars>

<body>

Verified:
- <command 1> → <result>
- spec: docs/execution/specs/desktop-cli-readonly/
```

## Post-merge

- [ ] 首发前两平台打包验收通过后切开关默认开；不通过保持关
- [ ] 另开规格：写命令（先补齐操作 id 与回执）、转交运行中应用、MCP 候选通道
- [ ] 删除 `docs/execution/specs/desktop-cli-readonly/`
