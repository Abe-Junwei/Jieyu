# 解语设计稿与验证证据

本目录按用途分组。设计提案不代替运行代码、产品验收或架构决定；产品事实仍遵循根目录 DESIGN.md、语义 tokens 和仓库现状文档。

## 设计交付

- `stitch-ui-engineering.latest.html`、`stitch-ui-engineering-addendum.md`、`stitch-ui-spec.md`：当前视觉与工程交接提案。
- `stitch-ui-manual.html`：设计手册。
- `stitch-workspace.initial.html`、`stitch-workspace.review.html`、`stitch-workspace.latest.html`：工作区方案迭代，不等于已上线页面。
- `initial-brief.md`：设计输入；`design-final-audit.md`：设计内容核对记录。
- 设计内容检查：`python3 scripts/check-ui-design-delivery.py`，不验证产品运行态。

## 审查与修复证据

- `transcription-preflight/`：早期转写审查及隔离样本截图；真实会话的旧截图仅留本机。
- `ui-ux-execution/report.md`、`before/`、`verified/`：首批审查与修复证据，对应 `d605753b`。
- `sidebar-audit/report.md`、`confirmed/`：侧栏修复前的确认数据与截图。
- `sidebar-fixes/report.md`、`final-e2e/`：侧栏修复结果，对应 `f960c901`；最终完整E2E关闭重试112通过/1既有跳过。
- 正式自动回归入口是 `tests/e2e/sidebarContent.spec.ts`；侧栏临时采集脚本只用于复现审查，不能代替缺陷断言。

## 版本控制边界

提交设计源稿、审查结论、最终合成数据截图与小型验证日志。生成的源码快照、重复运行目录、trace、大型备份包、旧真实会话截图和合成音频留在本地，不删除；详见本目录 `.gitignore`。

SQLite剩余接口规划是独立的待确认草稿，位于 `docs/execution/plans/sqlite-storage-port-remainder-2026-10-24.md`，与视觉提案和本轮侧栏修复分开提交。
