---
title: 单库业务约束收口 tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-29
source_of_truth: desktop-database-invariants-spec
depends_on:
  - ./requirements.md
  - ./design.md
  - ../../plans/desktop-database-invariants-2026-10-29.md
---

# Tasks — 单库业务约束收口

每项以半天内可评审为目标；超出即在该项下拆开再实施。W 编号与执行计划一致。

- [x] 读取当前实现/ADR/既有规格，核对工作区，完成成熟方案调研及三件套。
- [ ] W0 建入口清单，区分生产/脚本/测试/旧路径，固定测试与性能基线。
- [ ] W0 建不变量归属矩阵，迁移第一组历史反例，验证新旧测试同等断言。
- [x] W1 为 project.get / layers.create / units.updateText / media.finishCleanup 建类型化试点。handler 留在 desktopCall.ts。
- [x] W1 验证 unknown、额外键、会话和撤销行为等价。units.updateText 仍不拒绝额外键。其余操作仍走旧分派。
- [x] W2 收口四域共用 pending/receipt/redeliver（fieldDelivery.ts）。各域保留列、冲突判断和指纹。
- [ ] W3a 梳理生命周期状态和凭据，提取已有重复守卫，迁移普通读/单条读。
- [ ] W3a 分组迁移领域写、分析/任务、备注/字段入口；逐组关闭重开和迟到写入验证。
- [ ] W3b 列全部字段宿主创建入口，包括导入/批量/接受；收窄宿主类型。
- [ ] W3b 每宿主补缺值回滚/合法读回；消除创建与字段初始化可分离的外部入口。
- [ ] W4a 复用正文/分析的事务内共同步骤，验证代际、快照、图投影同成败。
- [ ] W4a 分组收口切分/合并/恢复的引用迁移；未确定的跨语段引用语义另列决定。
- [x] W4b 提取 sessionEdit 的执行、记忆和撤销。领域函数不读会话。既有测试覆盖错误、失效、切换和重开。崩溃不恢复撤销。
- [ ] W5a 对齐导入/导出/备份的文件保护和 owned-files 回滚；保留原件与未投影内容。
- [ ] W5b 对齐附件/录音收尾共用保护，分别验证 pending/unknown/重关联状态机。
- [ ] W5c 验证项目锁竞争、session/媒体授权撤销及真实 Electron 媒体路径。
- [ ] W6 按域迁移剩余操作合同和 handler，删除 METHODS/撤销白名单/旧 switch，移除过渡层。
- [ ] W6 更新结构守卫，验证所有生产/脚本入口没有事务/生命周期旁路。
- [ ] W7 迁完历史反例、跑全域回归/故障链/性能对拍/真实 Electron，按证据更新路线图。

## Pre-merge gates

- [ ] 每批 npm run typecheck + 触及域 vitest + eslint + git diff --check。
- [ ] 最终 npx vitest run src/db src/desktop。
- [ ] npm run check:schema-freeze + check:desktop-format-freeze。
- [ ] npm run check:script-desktop-callers + check:old-path-exit + check:db-transaction-facade + check:direct-db-imports。
- [ ] npm run check:architecture-guard + check:agent-evals:smoke + check:dev-agent-workflow-verify。
- [ ] npm run test:e2e:chromium + npm run test:e2e:desktop-project；失败归因后仍未通过则不报完成。
- [ ] npm run check:docs-governance；若触 src/ai 则升级 agent-evals:full。
- [ ] 若引入试用 flag：默认 false、自用一周、稳定一周期移除；无 flag 则记录等价替换证据。
- [ ] 提交仅包含当批授权内容，commit 正文附实际命令与结果；本规划不提交代码。
- [ ] 全部完成后删除规格和本次计划，永久决定留 ADR，测试与结构守卫留代码。
