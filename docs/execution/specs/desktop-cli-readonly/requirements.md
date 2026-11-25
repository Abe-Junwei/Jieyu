---
title: desktop-cli-readonly requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-11-25
source_of_truth: desktop-cli-readonly-spec
---

# Requirements — desktop-cli-readonly

## 1. What & Why

- **要做什么**：给最终用户的只读命令行 `jieyu`，能检查、查看、导出项目，并生成含本机技术日志的脱敏诊断包（ADR-0143 第一程）。
- **为什么现在做**：用户排错要能在不开界面、项目打不开时看现场；以后的脚本写入和外部 AI 也从这里接操作合同。随首发交付，但不阻断（ADR-0143 第 11 条）。
- **不做什么**：写命令、转交给运行中应用、MCP 服务、自动修复、上传诊断。

## 2. 用户场景

1. 项目打不开，用户运行 `jieyu doctor <项目文件夹>`，得到格式版本、完整性、外键和孤儿引用的报告，库文件字节不变。
2. 用户运行 `jieyu diagnose <文件夹>` 预览脱敏 JSON，再加 `--out <文件>` 写出，发给维护者。
3. 用户在 macOS 应用菜单点「安装 jieyu 命令」，或在 Windows 安装器勾选加入 PATH，之后在终端直接用 `jieyu`。

## 3. 验收标准

- [ ] 打包版关闭 `runAsNode` fuse；`ELECTRON_RUN_AS_NODE=1` 运行应用不再执行脚本。
- [ ] 只读命令不建库，不清理附件，不做打开时修正；运行前后 `project.sqlite` 字节哈希相同（含格式版本不符的库）。
- [ ] 应用已打开同一项目时以退出码 3 失败，提示先在应用里关闭项目。
- [ ] 非当前格式或非解语库退出码 4；`integrity_check`／`foreign_key_check` 不通过退出码 5 并列出问题。
- [ ] `--json` 带 `schemaVersion`，字段名英文；stdout 只有结果，日志在 stderr。
- [ ] 人读输出跟应用界面语言一致；没有同步过的偏好时按系统语言，仍无匹配时用中文。
- [ ] 技术日志按 ADR-0143 第 10 条记录，约 5MB×3 轮转；日志和诊断包都不含正文、gloss、词典正文、媒体内容和密钥（以哨兵字符串夹具断言）。
- [ ] `export` 复用 `exportDesktopJyt`／`exportDesktopJym` 与 `assertExportTarget`，失败不留半成品。
- [ ] macOS 与 Windows 打包版：终端可见输出、退出码正确、无窗口和 Dock 图标闪现，PATH 入口可装可卸。

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 主进程入口 | `electron/main.ts` | 修改：CLI 分支、菜单安装命令、接收语言偏好 |
| 打包 | `electron-builder.yml`、NSIS 脚本、fuse 设置 | 修改 |
| CLI | `src/desktop/cli/`（新） | 参数解析、命令表、输出、退出码、字典文案 |
| 只读打开 | `src/db/desktop/readOnlyProject.ts`（新） | 取锁、`readonly` 连接 |
| 检查 | `src/db/desktop/projectDoctor.ts`（新） | 版本、完整性、外键、孤儿引用 |
| 技术日志 | `electron/techLog.ts`（新）、`desktopCall.ts` 调用处 | 新增；写操作结果打点 |
| i18n | `src/i18n/index.ts`、字典 | 偏好同步到主进程；CLI 文案键 |
| 复用 | `projectExchange.ts`、`projectLibraryHeaderMatches`、`src/desktop/skeleton/projectLock.ts` | 仅调用 |

## 5. 已知风险与依赖

- Windows GUI 子系统的终端输出要实测，可能需要小启动器。
- 新依赖 electron-log 5.x：MIT、无依赖、约 93KB，2026-05 仍有更新。
- 依赖 ADR-0143、ADR-0099、ADR-0100 E08／E13、ADR-0140。
