---
title: desktop-save-recovery tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-11-17
source_of_truth: desktop-save-recovery-spec
---

# Tasks — 保存回执、草稿与会话恢复

- [x] 依据已确认行为整理design技术审阅稿及代码锚点。
- [x] 2026-11-01完成本轮接口/载荷与失败反例静态审查并修正发现的协议冲突；未替代运行验证。
- [ ] 完成设计中标出的选型/资源/平台实测；未验证不写成完成。
- [ ] 另出代码落位和定向测试Plan，未获实施确认不改代码。
- [ ] 按V01/V02/V04/V08/V12实际执行行为验收与重开读回，附证据。
- [ ] 实现完成后清理此spec，持续门转发布清单。

原技术审阅轮仅文档；当前 1a 正文交付证据见[发布验收清单](../../release-gates/desktop-product-design-acceptance.md#2026-11-17-1a-正文保存故障证据)。文档检查用`npm run check:docs-governance`、`npm run typecheck`、`npm run check:agent-evals:smoke`、`npm run check:dev-agent-workflow-verify`及`git diff --check`。后续产品定向测试/桌面实测清单见design及总验收协议。

## 切片0增补／转写切片1a实施与验证

- [x] 2026-11-17 格式：`user_version` 28，`text_save_receipts` 与 `unit_text_drafts`（ADR-0121）。旧库拒绝且不改字节。定向测试 `src/db/desktop/textSave.test.ts`。
- [x] 界面：稳定 operationId、500ms／5s 队列、离开链、刷新失败不重写。验证：`useDesktopDraftGuard.test.tsx`、`DesktopProjectReadPage.test.tsx` 的草稿重开。
- [x] 关窗能保存：Electron `project-flow.spec.ts`「saves a text draft when the window closes」关掉再打开，正文是刚保存的句子。
- [x] 关窗失败故障注入：Electron 验证留下保持输入、重试后重开读回、放弃后旧正文与草稿不复活。测试异步发起 `win.close()`，避免测试等待被关闭动作阻塞。
- [x] 提交后回执丢失：Electron 入口核实 committed、generation 仅增加一次、关闭重开正文一致。
- [x] 回执核实也失败：Electron 验证最新草稿不提前提交或关闭，核实恢复后保存最新输入并重开读回；guard 测试验证未知期间拒绝放弃。

1. 在 `src/db/desktop/schema.ts` 定义回执及草稿载体，并在 `operationContract.ts`、桌面调用分发和新领域模块接入业务事务；先核对冻结格式版本，受控合成项目重建，禁止修改真实旧库。
2. 在 `projectSession.ts` 协调运行中操作、退出与迟到请求；在桌面转写页面 controller 接入输入队列、保存状态、草稿与离开守卫，界面文案通过现有 i18n 字典。
3. 定向验证：提交前失败与提交后回执丢失、重复请求仅写一次、旧回执不覆盖新输入、非法草稿写入后重开读回、IME 输入、切稿／切页／关闭失败及重试／放弃。测试从真实桌面入口经主进程事务到重开读回，不以 mock 调用次数替代。
4. 每片运行 `npm run typecheck`、相关桌面 Vitest、`npm run test:e2e:chromium`、架构守卫与文档治理；故障注入及 Electron 实际入口证据单独记录。

正文实现已接 IPC 分发、关闭入口及格式冻结门；本片不覆盖通用执行器 attempt/epoch、跨对象撤销或只读多窗协议。

排期从属[主路线图2026-11-02队列](../../plans/解语-主路线图-master-roadmap-2026-06-01.md#2026-11-02-工程规格复审后的唯一执行队列)；先限定正文一条生产链，不将跨窗查询、全部字段/全部域草稿列为1a前置。
