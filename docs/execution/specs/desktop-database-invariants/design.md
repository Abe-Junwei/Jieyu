---
title: 单库业务约束收口 design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-29
source_of_truth: desktop-database-invariants-spec
depends_on:
  - ./requirements.md
---

# Design — 单库业务约束收口

## 1. 成熟方案扫描 / Research

- 既有实现：better-sqlite3 同步事务、writeRequiredFieldValues、diagnostic_deliveries、文件状态机与具名 client；复用，不引入 ORM/事件总线。
- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)：preload 只暴露受限能力；主进程仍处理不可信输入，不能以 TypeScript 类型替代运行时校验。
- [TypeScript mapped types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)：由操作键映射输入/输出及 handler 完备性；无需新 RPC 依赖或代码生成链。
- [SQLite transaction](https://www.sqlite.org/lang_transaction.html)：事务不嵌套 BEGIN；组合写路径复用同连接内部步骤，不在 dispatcher 一律套事务或含 await。
- [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)：业务和待交付记录同事务，提交后交付，接收方幂等；仅适配已有诊断协议，不引入队列或常驻 worker。
- 反模式：通用 create(table,fields)、检查后另次 IPC 写入、诊断失败自动重试业务、单个巨型注册对象掩盖领域职责。
- 潜在坑：type-only 导入误变运行时服务端依赖、JSON 指纹顺序变化、数据库提交后响应丢失、文件替换、测试钩子扩散到生产接口。
- 决定：适配上述成熟做法，复用现有依赖和存储；新增内部模块只在能删除重复责任时建立，无新增依赖/许可/包体成本。

## 2. 架构选择与不变量归属

- 类别：actions（领域写入）、routing（IPC 装配）、state（会话撤销）、effect（文件/诊断）；不新增 UI derived/state。
- 流向：页面或脚本 → 具名操作 → 运行时解析/会话 → 领域事务 → 提交后副作用 → 返回；普通读通过相应领域查询。
- operationContract.ts：唯一操作键和输入/输出合同，只含可用于 renderer 的类型/安全常量；对象状态合法性不塞入目录。
- 当前 operationHandlers 是 desktopCall.ts 内的对象；四操作试点到此停止。合同键与 METHODS 的期望并集是 operationCatalog.baseline.ts 里 5fbc66f8 的 128 键；测试不读 Git，生产入口普查仍属 W0。
- runContract 仍逐键 switch；never 只保四键穷尽。未来扩展先消除逐键执行分派，让记忆逆操作跟策略走；当前 replace-on-success 写死 UnitTextUndo，未泛化前不迁切分/合并/改派。
- 具名 client 包装可保留调用便利性，内部 call<K> 从合同推导输入输出；只有传输 seam 保留受控类型断言。
- 不要求契约、parser、SQL 同文件；允许主进程实现独立，通过类型完备性和运行时测试保持一致。
- 领域入口拥有业务事务；内部 InTransaction 步骤用于导入和组合写入，不允许页面、脚本直接调用。
- scopeGuards.ts（候选）：复用文稿/层/语段解析与生命周期凭据检查；在实际写事务内核对，不把已检查对象长期缓存为权限。
- 普通读查询直接过滤删除内容。getUnit 与 units.get 只见未删除文稿的语段；readStoredUnit 保留存储行给写入、清除、迁移和保留期核对，删除触发器仍报 manuscript is deleted。readAnalysisState 在领域入口同样拒绝已删除文稿；readAnalysisMaterial 仍返回存储行。readContentNote 与 notes.list 隐藏已删除文稿的备注；readStoredContentNote 给更新和删除。项目备注仍可见。readFieldValue 隐藏已删除文稿上的字段值；readStoredFieldValue 与 locateValues 给写入和清除。可接受任务名单只含未删除且代际仍匹配的运行；getModelRun 仍返回旧任务。getLayer 与 layers.list 隐藏已删除文稿的层，存储行仍在。readLexemeLinks 与 references.listLinks 隐藏已删除文稿上的词条链接，存储行仍在。切词和改图在已删除文稿上仍由写入触发器报 manuscript is deleted，恢复后可以再写。不暴露 includeDeleted。
- 必填字段沿用 writeRequiredFieldValues；先收窄 targetType 和合法创建入口，再用入口矩阵证明覆盖；不新增通用宿主 CRUD 框架。
- fieldDelivery.ts 已共用重放查重、pending 记录、提交后确认和 redeliver；各域仍拥有业务事务、字段冲突和输入指纹，source 固定字段加 null 的指纹保持不变。source 已注入事务中止、收件后确认失败和关闭重开补交。
- 既有指纹/summary/event_seq 必须字节语义兼容；不能用统一 JSON 序列化偷偷改变重放身份。
- 图编辑共用内部持久写步骤，拥有正文/图/投影/关联/代际完整结果；按编辑类型决定保留、迁移或失效引用。
- projectSession.ts 只管资源生命周期；sessionEdit.ts 管理 edit、remember 和 undo，会话状态不进入纯 SQL 模块。
- 文件保护只抽取已重复且同语义的身份/路径/发布逻辑；附件、录音、原件三种生命周期分别保留。

## 3. 落位与拆分约束

| 路径（相对仓库根） | 职责与预算 |
| --- | --- |
| src/db/desktop/operationContract.ts | 无 Node/数据库运行时依赖的合同；按域类型拆分，避免巨型定义 |
| src/db/desktop/desktopCall.ts | 四操作试点的 handler 留在这里，未另建 operationHandlers.ts |
| src/db/desktop/client.ts | 四个试点方法按合同推导结果；其余调用仍用 once |
| src/db/desktop/scopeGuards.ts | 仅复用生命周期解析与凭据，不承担事务框架 |
| src/db/desktop/fieldDelivery.ts | 共同补交协议；目标小于 300 行，超过先审查职责 |
| src/db/desktop/sessionEdit.ts | 会话内一步编辑协调；不新增持久化格式 |
| src/db/desktop/units.ts、unitSpan.ts、analysis*.ts、modelRuns.ts | 保留领域所有权，提取实际共同内部写步骤 |
| src/db/desktop/projectExchange.ts、foreignImport.ts、attachments.ts、mediaCleanup.ts | 状态机不合并，保护逻辑按重复证据收口 |
| scripts/check-desktop-operation-boundaries.mjs（候选） | 导入方向和外部绕过检查，加入现有守卫链 |

已落地的是 operationContract.ts、fieldDelivery.ts、sessionEdit.ts。表中其余新文件仍是计划落位，实施前以复用检索为准。不建立 src/services 平行数据库抽象，延续 ADR-0085 的桌面模块落位。

## 4. 兼容、失败与发布

- 维持方法字符串、参数、返回结构、错误语义及各操作的额外键行为；units.updateText 继续丢弃额外键，W6 不顺手收紧。
- 一次业务写入一次主事务/一次 IPC；诊断确认和文件收尾的额外事务属于现有外部副作用协议，必须如实说明，不能假装跨资源原子。
- unitTextUndo.test.ts 已刻画：project.get keep；正文写入失败保留旧步，提交后回调带回 undo 才 replace-on-success；layers.create clear 在参数解析前，拒绝额外键也清旧步。
- reopenDesktopSession 仅在 openProject 抛错时 expireSessionEdit 并原样抛出。成功重开不清槽。失败断言发生在下一次 openDesktopSession 之前：对改后正文的一致副本调用 undoSessionEdit，错误是空槽而不是 undo is stale，副本正文不变。
- 提交后响应丢失仍是结果未知；不自动重试；可查询事实沿用现有能力，不普遍承诺 exactly-once。
- 已有文件只验证/拒绝，DDL、user_version、application_id、冻结记录、包字段不改，无项目数据迁移。
- 通过小批等价替换控制风险；若进入双实现试用，按仓库规则单独 flag 默认 false、单次只执行一路，禁止双写，稳定一周期移除。
- 每批可回退代码；只用合成项目验证。未经新决定不启用真实用户数据转换、不清理既有原件/孤儿文件。
- 无新持久化/协议决定，当前不新建 ADR；若实施需要改变这些条件，先提交独立 ADR 再进入对应任务。

## 5. 验证与证据

- 测试跨 client → dispatcher → 真实临时 SQLite → 关闭重开 → 业务读回；脚本入口另覆盖，不以 mock 调用次数代替。
- 每次事务至少注入首写后和关联写入后的失败；文件另覆盖发布前后、DB 提交前后、结果确认前后。
- 保留历史反例直到常规测试覆盖同等业务结果，再按组迁移 __audit__；不删尚未迁移的已跟踪测试。
- 类型负例证明非法参数/遗漏 handler 不可编译；结构检查证明 renderer 无 Node/DB 运行时依赖、脚本无内部写旁路。
- 逐批 typecheck、定向 vitest、边界守卫；最终全域回归、格式冻结、architecture、agent smoke、Chromium 和真实 Electron。
- abcdada5 上重跑过 operationContract、unitTextUndo、四域 Fields、requiredCreateReadback：7 文件 34 项通过。其后的目录对账与失败重开清槽另有 operationContract、unitTextUndo、projectSession 共 14 项。getUnit 切片另有文稿删除、备份、交换、清除、迁移、切分、派发音人、分析根和 desktopCall 共 9 文件 52 项。readAnalysisState 切片另有文稿删除、分析恢复、候选、清除、迁移和 fix-life 共 6 文件 44 项。备注切片另有文稿删除和 notes 共 2 文件 18 项。字段切片另有文稿删除、字段读写、宿主、记录、清除、迁移、词条和必填读回共 8 文件 52 项。任务名单切片另有文稿删除和 modelRuns 共 2 文件 20 项。层切片另有文稿删除和 create 共 2 文件 17 项。词条链接切片另有文稿删除、引用状态和词条链接共 3 文件 25 项。分析迟到写入由文稿删除 18 项锁住。其余领域写由同一文件 19 项锁住：创建、边界、切分、合并、备注、开任务、时间映射、切语素和提交在删除后仍报 manuscript is deleted；已提交候选在删除和恢复后接受仍报 analysis candidate is stale；语料查询不返回已删除文稿。写入实现没有改。source 故障注入另有 sourceFields 5 项。都不代表 W0 或宿主验收完成。
- 13 宿主只覆盖现有 required-field 调用路径。project 首次创建缺必填值会回滚，入口仍无 fieldValues。source 没有具名创建函数。分析节点、关系和转写接受的缺值回滚已测。foreignImport 缺必填语段仍逐条跳过。脚本只许 import-desktop-file 加载 foreignImport。改正文和改图写入后失败都会回滚，两处没有抽共用函数。导入失败只删本次复制的文件。录音收尾失败重开后仍是 failed。媒体到附件、自定义字段、来源和发音人已进入目录。W3b 不勾完成。
