---
title: 单库业务约束收口 tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-30
source_of_truth: desktop-database-invariants-spec
depends_on:
  - ./requirements.md
  - ./design.md
  - ../../plans/desktop-database-invariants-2026-10-29.md
---

# Tasks — 单库业务约束收口

每项以半天内可评审为目标；超出即在该项下拆开再实施。W 编号与执行计划一致。

- [x] 读取当前实现/ADR/既有规格，核对工作区，完成成熟方案调研及三件套。
- [x] W0 入口：check:script-desktop-callers 仍允许 import-desktop-file.mjs 只加载 foreignImport。其他脚本加载 src/db/desktop，或调用 writeRequiredFieldValues、writeUnitFieldValues、ensureProjectIdentity、createUnit，会被拦住。
- [ ] W0 入口 SQL：既有 roundtrip 脚本含旧库 INSERT。全禁会误伤，合同未定，这一刀不改那些脚本。
- [x] W0 性能：空合成项目上一次 media 计数查询 0.822 ms，一次 media 插入 0.412 ms。数字也写在媒体域那次提交说明里。
- [ ] W0 反例：一次只迁一个 __audit__ 文件。先有能捕获原缺陷的常规测试，再删该文件。
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
- [x] W3b 已有 13 宿主创建缺值回滚/合法重开读回测试通过。
- [x] W3b project 缺值回滚：首次创建遇到必填项目字段且没有值时，报 project is missing a required field。失败后没有项目行或字段值，关闭重开后仍相同。已有项目行再次打开不因缺值拒绝。直接调用和 openDesktopSession 都测了。
- [ ] W3b project 字段值：ensureProjectIdentity 仍无 fieldValues。这只说明入口还不能在创建时写入合法必填值，不是运行时拒绝多传参数。必填初始化仍有限制。
- [ ] W3b source：没有具名创建函数。生产代码不插入 sources 行，测试里的 INSERT 不是创建合同。缺值回滚未做，不新增创建入口。
- [x] W3b analysis-node：缺必填新节点时 analysis import 整段回滚。旧图指纹、词项投影不变，关闭重开后仍是旧图。沿用 assertStoredCustomFields。
- [x] W3b analysis-relation：缺必填新关系时 writeAnalysisRoot 整段回滚。旧图、词项投影不变，关闭重开后仍没有这条关系。
- [x] W3b 导入：上面的 analysis import 就是这一条整段回滚路径。foreignImport 缺必填语段仍逐条跳过并记 unprojected，这是已有合同，本刀不改。
- [x] W3b 接受：modelRuns.accept 缺必填语段字段时整段回滚。失败后没有新语段、没有接受记录，pending 仍是 1，关闭重开后仍相同。这条路径没有外层逐项提交。
- [x] W4a 改正文：unit_texts 更新后注入失败，重开后正文、图、词项投影和文稿代际仍是前态。没有提取共用函数。
- [x] W4a 改图：applyAnalysis 在投影写入后注入失败，重开后图、词项和文稿代际仍是前态。与改正文不是同一段代码，没有提取共用函数。
- [ ] W4a 跨语段引用：不实施。合同未定，保持独立决定。
- [x] W4b 已提取 sessionEdit 的记忆和一步撤销；领域函数不读状态，崩溃即丢、不改格式。
- [x] W4b 失败重开已清槽并有等价测试。runContract 逐键分派和 UnitTextUndo 写死类型仍在迁新键前处理。
- [x] W4b 正文未改仍保留上一步撤销。unitTextUndo 连续两次写成同一正文后，撤销仍回到上一步。没有改时机。
- [x] W5a 一次导入在文稿插入时失败，只删除本次复制的来源和录音，原件、项目里已有的文件和已有哈希对象都不动。重开后没有新文稿、没有新录音行。
- [x] W5b 录音收尾 trash 失败后状态是 failed。关闭重开后仍是 failed，录音行和文件还在。没有改附件。
- [x] W5c 项目锁竞争沿用 projectLock.process.test.ts：两个进程只有一个能写。Electron 媒体路径仍留在 W7。
- [x] W6 预备：project.get 保持撤销槽，layers.create 和 media.finishCleanup 在检查前清槽，units.updateText 只在成功后替换。键集仍是这四个。METHODS 还在。
- [x] W6 媒体：create、delete、previewDelete、showReminder、reregister、restoreRegistered、list 已进入目录。读操作保持撤销槽，写操作在检查前清槽。METHODS 里不再有这些键。
- [x] W6 文稿：create、list、listDeleted、delete、previewDelete、restore、showReminder、purge、setTimeMapping、rollbackTimeMapping 已进入目录。list 仍忽略多余参数。读操作保持撤销槽，写操作在检查前清槽。
- [x] W6 层：layers.list 已进入目录，保持撤销槽，仍不拒绝多余参数。layers.create 本来就在目录里。
- [x] W6 目录：语言、正字法和桥的读写已进入目录。读操作保持撤销槽，写操作在检查前清槽。
- [x] W6 词条：保存、读取、义项链接、候选、匹配、语段链接和新建已进入目录。读操作保持撤销槽，写操作在检查前清槽。
- [x] W6 备注：创建、修改、删除、列表、词条备注已进入目录。列表保持撤销槽，写操作在检查前清槽。
- [x] W6 任务：开跑、收尾、预览、接受、放弃、中断、停文稿、停录音、读取和可接受名单已进入目录。读取和名单保持撤销槽，写操作在检查前清槽。
- [x] W6 语料：检索保持撤销槽，检查仍要求成对的词位和义项。
- [x] W6 语段：创建、读取、名单、撤销、切分、合并和改边界已进入目录。读取和撤销保持槽；切分和合并仍在写入成功后记住新的一步。
- [x] W6 删除提醒：到期名单保持撤销槽，仍拒绝多余字段。
- [x] W6 附件：发布和解除链接在检查前清槽，名单保持撤销槽。
- [ ] W6 之后每域一刀。下一域再改实现、目录和测试。
- [ ] W7 不拆功能。前面做完后按门禁逐条跑，含真实 Electron 的文件选择、媒体读取和垃圾箱。不过就不勾完成。

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
