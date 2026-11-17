---
title: desktop-save-recovery tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-save-recovery-spec
---

# Tasks — 保存回执、草稿与会话恢复

- [x] 依据已确认行为整理design技术审阅稿及代码锚点。
- [x] 2026-11-01完成本轮接口/载荷与失败反例静态审查并修正发现的协议冲突；未替代运行验证。
- [ ] 完成设计中标出的选型/资源/平台实测；未验证不写成完成。
- [ ] 另出代码落位和定向测试Plan，未获实施确认不改代码。
- [ ] 按V01/V02/V04/V08/V12实际执行行为验收与重开读回，附证据。
- [ ] 实现完成后清理此spec，持续门转发布清单。

本轮仅文档；检查用`npm run check:docs-governance`、`npm run typecheck`、`npm run check:agent-evals:smoke`、`npm run check:dev-agent-workflow-verify`及`git diff --check`。后续产品定向测试/桌面实测清单见design及总验收协议。

## 切片0增补／转写切片1a实施计划（待验证）

1. 在 `src/db/desktop/schema.ts` 定义回执及草稿载体，并在 `operationContract.ts`、桌面调用分发和新领域模块接入业务事务；先核对冻结格式版本，受控合成项目重建，禁止修改真实旧库。
2. 在 `projectSession.ts` 协调运行中操作、退出与迟到请求；在桌面转写页面 controller 接入输入队列、保存状态、草稿与离开守卫，界面文案通过现有 i18n 字典。
3. 定向验证：提交前失败与提交后回执丢失、重复请求仅写一次、旧回执不覆盖新输入、非法草稿写入后重开读回、IME 输入、切稿／切页／关闭失败及重试／放弃。测试从真实桌面入口经主进程事务到重开读回，不以 mock 调用次数替代。
4. 每片运行 `npm run typecheck`、相关桌面 Vitest、`npm run test:e2e:chromium`、架构守卫与文档治理；故障注入及 Electron 实际入口证据单独记录。

尚须在实现前把现有 IPC 分发、窗口关闭入口和 schema 冻结门逐项对齐到具体函数；本计划未证明这些改动已经实现。

排期从属[主路线图2026-11-02队列](../../plans/解语-主路线图-master-roadmap-2026-06-01.md#2026-11-02-工程规格复审后的唯一执行队列)；先限定正文一条生产链，不将跨窗查询、全部字段/全部域草稿列为1a前置。
