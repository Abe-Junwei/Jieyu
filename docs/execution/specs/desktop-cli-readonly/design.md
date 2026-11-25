---
title: desktop-cli-readonly design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-25
source_of_truth: desktop-cli-readonly-spec
depends_on:
  - ./requirements.md
---

# Design — desktop-cli-readonly

## 1. 成熟方案扫描 / Research

- **仓库既有模式**：写入统一走 `desktopOperations` 和 `runContract`；项目锁 `tryAcquireProjectLock`；导出 `exportDesktopJyt`／`exportDesktopJym`；库头校验 `projectLibraryHeaderMatches`；主进程已有 `--smoke` 和 `JIEYU_DESKTOP_*` 环境变量；界面语言存在渲染进程 `localStorage` 的 `jieyu.locale`，主进程读不到。
- **同类产品**：VS Code 的 `code` 用 `ELECTRON_RUN_AS_NODE` 跑 CLI，macOS 菜单提供「Install 'code' command in PATH」，Windows 安装器勾选加入 PATH，并有 `--status` 打印诊断。我们照它的 PATH 入口，不照它的启动方式。
- **规范**：Electron fuses 文档说明关闭 `runAsNode` 后 `ELECTRON_RUN_AS_NODE` 失效；MCP stdio 要求 stdout 只放协议消息、日志进 stderr，本片输出约定同此。
- **反模式**：CLI 自带写入逻辑；绕锁或另开写连接；复用会建库和清理的 `openProject` 读坏库；让用户另装 Node 跑原生模块；日志写入参原文。
- **坑**：Windows GUI 子系统终端输出；macOS 无窗口运行的 Dock 图标；`journal_mode=DELETE` 下读连接会挡写者；`/usr/local/bin` 可能需要管理员授权；electron-log 默认会挂 renderer 和控制台，需只开文件通道。
- **决定**：**适配**。参数解析用 Node 自带 `util.parseArgs`；日志用 electron-log（只用主进程文件传输）；其余自写。

## 2. 架构选择

- **启动**：打包时用 `@electron/fuses`（electron-builder 已带）关闭 `runAsNode`。`main.ts` 在 `app.whenReady` 前识别 `jieyu` 子命令：不建窗口，macOS 隐藏 Dock，执行完以退出码 `app.exit`。Windows 若 spike 证明拿不到输出，加一个只转发参数和 stdout／stderr／退出码的小启动器。
- **只读打开**：`tryAcquireProjectLock` 失败 → 3；库头与 `user_version` 不符 → 4；`new Database(file, { readonly: true, fileMustExist: true })`。不调用 `openProject`、不 `sweepAttachmentTmp`、不设写库 pragma。结束释放锁。
- **检查项**：`user_version`、库头签名、`PRAGMA integrity_check`、`PRAGMA foreign_key_check`、无外键引用（如 `notes.unit_text_id`）。只计数和给对象 id。
- **语言**：渲染进程设置或启动时把 `jieyu.locale` 经 IPC 写到用户数据目录；CLI 读它，读不到用 `app.getLocale()` 规范化，再不行 `zh-CN`。文案键进字典，CLI 与界面共用 `Locale`。
- **技术日志**：`electron/techLog.ts` 封装 electron-log，只允许结构化字段（事件、操作名、操作 id、耗时、结果、错误类别、版本），不接受任意字符串入参。`runContract` 外层打点成功与失败。
- **诊断包**：单个 JSON：`schemaVersion`、应用与系统版本、`doctor` 结果、最近日志条目。无 `--out` 只打印预览。
- **拒绝的方案**：应用开着时并发只读（挡写者）；renderer 的 `featureFlags.ts` 加开关（读 `VITE_` 构建变量，主进程不用）。

## 2.5 UI 精稿对照

仅新增 macOS 应用菜单项「安装 jieyu 命令」及其结果提示，用系统原生菜单与对话框，无页面、样式或共享组件改动，不适用 Pixso 精稿。

## 3. 落位清单

| 文件 | 职责 | 复杂度估计 |
| --- | --- | --- |
| `src/desktop/cli/runCli.ts` | 解析、分发、退出码 | < 150 |
| `src/desktop/cli/commands.ts` | `inspect`／`doctor`／`export`／`diagnose` | < 200 |
| `src/desktop/cli/output.ts` | 人读／`--json`、按语言取文案 | < 120 |
| `src/db/desktop/readOnlyProject.ts` | 只读打开与释放 | < 100 |
| `src/db/desktop/projectDoctor.ts` | 检查项 | < 250 |
| `electron/techLog.ts` | 日志封装与轮转配置 | < 100 |
| `electron/cliInstall.ts` | macOS 安装／卸载 `jieyu` 链接 | < 100 |
| `electron/main.ts` | CLI 分支、菜单、语言 IPC（仅装配） | + < 50 |

## 4. ADR 引用

- [ADR-0143](../../../adr/0143-cli-is-another-door-to-the-operation-contract.md)、[ADR-0099](../../../adr/0099-desktop-product-design-and-release-contract.md)、[ADR-0100](../../../adr/0100-desktop-engineering-contract.md) E08／E13、[ADR-0140](../../../adr/0140-unit-text-audios.md)。
- 不新建 ADR。Windows 启动器的 spike 结论写回本文 §2。

## 5. Feature flag

- 开发期主进程环境变量 `JIEYU_DESKTOP_CLI=1` 才识别子命令和显示安装菜单，默认关。技术日志不挂开关。
- 首发前两平台打包验收通过才切默认开；不通过保持关，不延发布（ADR-0143 第 11 条）。

## 6. 失败模式 / 兼容性

- 开关关闭时 CLI 分支和菜单不出现；关闭 `runAsNode` 前先确认仓库没有 `child_process.fork` 依赖它。
- 不改格式，不升 `user_version`，无迁移。
- 回滚：关开关；日志目录可删，无项目内痕迹。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/desktop/cli src/db/desktop/readOnlyProject.test.ts src/db/desktop/projectDoctor.test.ts electron/techLog.test.ts` | all pass |
| 进程级 | `npx vitest run src/desktop/cli/cli.process.test.ts` | 退出码 0／2／3／4／5，字节哈希不变 |
| 结构守卫 | `npm run check:architecture-guard` | OK |
| i18n | `npm run check:i18n-hardcoded` | OK |
| 文档 | `npm run check:docs-governance` | OK |
| 打包验收 | macOS／Windows 打包版：`inspect --json`、`doctor`、`diagnose`、PATH 安装／卸载、`ELECTRON_RUN_AS_NODE` 失效 | 全部符合 requirements §3 |
