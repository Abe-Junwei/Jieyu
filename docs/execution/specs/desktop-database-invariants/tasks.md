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
- [x] W1 四键试点到此停止；现有测试锁住额外键与三种撤销时机，units.updateText 仍忽略额外键。
- [x] A：operationContract.test.ts 用 5fbc66f8 的 128 键固定目录核对互斥、无重复和并集；不读 Git，不普查入口。
- [x] B：reopen 打开失败时 expireSessionEdit 后原样抛出；成功重开仍可撤销。失败断言在再次 openDesktopSession 之前，空槽错误且一致副本正文不变。
- [x] W2 共用协议已落地 fieldDelivery.ts，四域原有测试通过，各域保留列、冲突和指纹；不再重复拆分。
- [x] W2 故障注入：source 事务中止时正文和 pending 一起回滚；诊断文件先收件、确认更新失败后状态仍是 pending，关闭重开再补交只确认一次且不改修订。四域原有冲突和 pending 测试仍在。
- [x] W3a 首个切片：getUnit 与 units.get 隐藏已删除文稿的语段；readStoredUnit 保留写入、清除、迁移和保留期读取。直接调用和 IPC 都测了，恢复后普通读重新可见。
- [x] W3a 分析普通读：readAnalysisState 在领域入口拒绝已删除文稿；readAnalysisMaterial 仍返回存储行。直接调用和 IPC 都测了，恢复后重新可见。
- [x] W3a 备注普通读：readContentNote 与 notes.list 隐藏已删除文稿的备注；readStoredContentNote 给更新和删除。直接调用和 IPC 都测了，恢复后重新可见，项目备注仍可见。
- [x] W3a 字段普通读：readFieldValue 隐藏已删除文稿上的文稿/层/语段/备注字段值；readStoredFieldValue 与 locateValues 给写入和清除。直接调用和 IPC missingUnitFields 都测了，恢复后重新可见。
- [x] W3a 任务名单：listAcceptableRuns 只含未删除且代际匹配的运行。getModelRun 仍返回旧任务。删除、恢复和关闭重开都测了；新任务重新出现。迟到接受仍报 transcription run is stale。
- [x] W3a 层普通读：getLayer 与 layers.list 隐藏已删除文稿的层，存储行仍在。直接调用和 IPC 都测了，关闭重开后仍隐藏，恢复后重新可见。迟到创建仍报 manuscript is deleted。
- [x] W3a 词条链接普通读：readLexemeLinks 与 references.listLinks 隐藏已删除文稿上的链接，另一份文稿的链接仍在，存储行仍在。关闭重开后仍隐藏，恢复后重新可见。迟到改链仍报 manuscript is deleted。
- [x] W3a 分析迟到写：切词和改图在已删除文稿上由触发器报 manuscript is deleted。直接调用和 IPC 都测了，关闭重开后仍拒绝，恢复后可以再写。图指纹不变。
- [x] W3a 其余领域写：创建、边界、切分、合并、备注、开任务、时间映射、切语素和提交分析在已删除文稿上仍报 manuscript is deleted。直接调用和 IPC 都测了，关闭重开后仍拒绝，恢复后可以再建语段。删除前的分析候选在删除和恢复后接受仍报 analysis candidate is stale。语料查询不返回已删除文稿。写入实现没有改。
- [ ] W3b 列全部字段宿主创建入口，包括导入/批量/接受；收窄宿主类型。
- [x] W3b 已有 13 宿主创建缺值回滚/合法重开读回测试通过。
- [ ] W3b 继续审查 project/source、分析图节点、导入/批量/接受及全部旁路；13 项不能代表创建入口全覆盖。
- [ ] W4a 复用正文/分析的事务内共同步骤，验证代际、快照、图投影同成败。
- [ ] W4a 分组收口切分/合并/恢复的引用迁移；未确定的跨语段引用语义另列决定。
- [x] W4b 已提取 sessionEdit 的记忆和一步撤销；领域函数不读状态，崩溃即丢、不改格式。
- [x] W4b 失败重开已清槽并有等价测试。runContract 逐键分派和 UnitTextUndo 写死类型仍在迁新键前处理。
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
