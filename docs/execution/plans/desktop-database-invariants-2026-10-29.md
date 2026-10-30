---
title: 单库数据库业务约束重构方案
doc_type: execution-plan
status: draft
owner: repo
last_reviewed: 2026-10-30
source_of_truth: desktop-database-invariants-refactor-plan
depends_on:
  - ../specs/desktop-database-invariants/requirements.md
  - ../specs/desktop-database-invariants/design.md
  - ./desktop-project-sqlite-2026-10-25.md
---

# 单库数据库业务约束重构方案

## 目标与基线

目标是让具名领域操作成功即产生完整、合法、可重开的业务结果，减少调用方需要记住的步骤。
这不是重写数据库，也不以文件变短为验收标准。四条架构建议纳入同一计划，但目录去重不能替代领域一致性收口。

本次检查基线：分支 feat/desktop-single-library-page-paths，HEAD abcdada5，核对前工作区干净。
既有修复按当前代码保留；历史漏洞只作为回归资产，不宣称仍然存在。本轮重跑 7 文件 34 项通过：operationContract 2、unitTextUndo 3、四域 Fields 各 4、requiredCreateReadback 13。该证据只覆盖已落地切片，不代表完整重构完成。
四操作合同、四域 fieldDelivery、sessionEdit 和 13 宿主创建回归已落地；旧分派仍承载其余操作。W0 入口清单、完整不变量矩阵和性能基线尚未完成。
现有执行规格仍有过时的实施状态，不能照抄为当前事实；ADR 决定与本次代码核对优先。

## 保持与范围

- 一个 project.sqlite；具名操作；页面不传表名/SQL/事务回调；主进程拥有事务。
- user_version 27、DDL、application_id、formatFreeze.record.json、JYT/JYM 格式保持不变；不新增数据库迁移。
- 普通业务写入一次主事务、一次 IPC；诊断和文件收尾的阶段性事务按 ADR-0091/0095/0087 单独说明。
- 保留现有方法名、返回形状、冲突/错误语义，不新增自动写入重试或持久撤销。
- 覆盖桌面库、桌面 client/调用入口、preload/main 的接线、打开/写桌面库的脚本和合成项目。
- 旧 Dexie 退出、浏览器回退政策、CSP、五个超长 hook、UI 重做、模型运行时和打包发布不纳入本轮；宿主验收遇阻如实记录。

## 目标职责

| 层次 | 必须承担 | 不承担 |
| --- | --- | --- |
| client / 类型合同 | 具名调用、精确参数与结果，一次调用 | 业务合法性和重试决策 |
| IPC adapter | 不可信输入解析、会话、受限能力、分派 | SQL、领域事务编排 |
| 领域操作 | 生命周期、范围、必填初始化、关联写、事务内读回 | userData/文件跨资源原子承诺 |
| 内部事务步骤 | 同连接下可组合的领域写入 | 外部公开 CRUD、另开连接或独立提交 |
| 会话编辑 | 一步逆操作的记忆、失效、执行 | 持久历史和崩溃恢复撤销 |
| 文件/诊断 | 身份保护、阶段结果、幂等补交 | 吞掉失败、把不存在当成功 |

新增文件仅是 design 中的候选落位；能扩展现有模块并删掉重复责任就不另建。无 ORM、容器、通用仓储、事件总线、代码生成链。

## 不变量归属与证据矩阵

| 规则 | 最终所有者 | 必须覆盖的入口 | 核心证据 |
| --- | --- | --- | --- |
| 操作名/输入输出/撤销策略齐全 | operationContract + 主进程 handler 装配 | client、preload、scripts | 类型负例、非法输入、完备性 |
| 当前对象可读/可写 | manuscripts/layers/units 等领域入口及共用守卫 | 普通列表/单条/搜索/分析/字段/备注/导入 | 删除→拒绝→恢复→旧任务仍拒绝 |
| 创建后合法完整 | 各具名 creator + required-field 内部写 | 每种宿主、批量/导入/接受 | 缺值整次回滚、合法重开读回 |
| 图真值与线性投影一致 | analysis/units/unitSpan 的内部写步骤 | 改正文/接受/恢复/切分/合并/导入 | 图/词项/关联/快照/代际对拍 |
| 修订与补交一致 | 四域字段实现 + 共用补交协议 | patch/redeliver | 同身份重放、异载荷冲突、收件后崩溃 |
| 磁盘结果可判定 | 各现有文件状态机 | 附件/原件/媒体/交换/备份/清除 | 阶段失败、替换/链接、重开收尾 |
| 撤销不会执行陈旧逆操作 | sessionEdit + projectSession | 所有保留/清除/产生 undo 的操作 | 操作序列、失败、切换、关闭重开 |

W0 把每行展开到全部实际入口，标明生产、脚本、内部、测试和不可达旧路径；禁止只靠方法名或文件存在勾覆盖。

## 分波交付

### W0：固定基线与业务结果测试

本轮顺序不取代最终目标。本轮只扩展 check:script-desktop-callers：scripts/import-desktop-file.mjs 调用 importForeignFile 仍合法；阻止脚本直接拼接底层写函数、事务内步骤或 SQL。不重做入口普查，不新写入口链清单。历史反例一次只迁一个 __audit__ 文件，先有能捕获原缺陷的常规测试，再删该文件；禁止整目录删除。
最终阶段仍要列 entry → parser → domain → transaction → effects → readback，并用合成小项目和较大项目记录查询耗时、写入耗时、SQL/事务数、IPC 数、导入峰值内存、renderer 服务端依赖。查询和写入耗时放在首次 W6 实质迁移之前。其余宽基线留到 W7，不在前面的刀里做成入口散文。

### W1：四操作合同试点已落地，停止扩展

operationContract.ts 的四键为 project.get、layers.create、units.updateText、media.finishCleanup；handler 对象仍在 desktopCall.ts，不另建一套试点。
layers.create 覆盖可选字段与 fieldValues；media.finishCleanup 覆盖会话目录和外部 trash 能力；conversations.create 未迁。
client 四键按合同推导结果，其余仍用 once；四键已离开 METHODS 和旧 switch。集合对账的期望值是 `5fbc66f8` 的 128 个 `METHODS`，固定在 `operationCatalog.baseline.ts`，测试运行时不读 Git。生产入口宽普查留到 W0 最终阶段，本轮不重做。
额外键：project.get、layers.create、media.finishCleanup 拒绝，units.updateText 按旧行为忽略；W6 不顺手收紧。
撤销：project.get keep；正文写入失败保留旧步，事务提交后回调带回逆操作才 replace-on-success；layers.create 在参数检查前 clear，拒绝额外键也清槽。
unitTextUndo.test.ts 已锁住这些时机；operationContract.test.ts 锁住参数与策略，不能把 clear 改为仅成功时清除。
`operationContract.test.ts` 核对两集合各自无重复、互斥，并集等于上述固定目录。再迁键或新增操作时改实现和这份目录，不能把两集合拼起来当期望值。
现有合同、operationHandlers、runContract switch、client 包装仍多处列键；never 只覆盖四键穷尽，不等于消除了重复分派。
后续迁移前先让执行/记忆跟策略走，避免增加逐键 case；replace-on-success 当前写死 UnitTextUndo，不能直接接切分/合并/改派的 SessionEdit。

### W2：四域补交协议已落地，剩余故障验收

fieldDelivery.ts 已共用 replay/pending/finish/resume；四域仍拥有业务事务、列和字段冲突，并各自计算输入指纹。
source 固定 id/label/externalId 加 null 的指纹保留，未变成统一 JSON.stringify(input)；其余域也维持既有重放身份。
四份原字段测试本轮均通过；不再执行“先 source，再逐域提取”的旧拆分任务。
sourceFields.test.ts 已注入：事务中止时正文和 pending 一起回滚；诊断文件先收件、项目里的确认更新失败后状态仍是 pending；关闭重开再补交只确认一次，修订不增加。提交后诊断不可用、同身份不重复写、异输入冲突、多字段任一冲突整回滚仍由四域原有测试锁住。只补日志，不重放业务。

### W3a：生命周期与对象范围收口

落位：manuscripts/layers/units、analysisRestore/modelRuns、notes/customFields/customFieldPurge、lexicon/lexemeLink/corpusQuery 等实际入口。
getUnit 与 units.get 只返回文稿未删除的语段；readStoredUnit 保留存储行，供写入、清除、迁移和保留期核对，删除触发器仍报 manuscript is deleted。readAnalysisState 已同样收进领域入口，已删除文稿仍报 manuscript is deleted；readAnalysisMaterial 保留存储行。readContentNote 与 notes.list 隐藏已删除文稿的备注；readStoredContentNote 给更新和删除，项目备注仍可见。readFieldValue 隐藏已删除文稿上的字段值；readStoredFieldValue 与 locateValues 给写入和清除。可接受任务名单只含未删除且代际仍匹配的运行；getModelRun 仍返回旧任务。getLayer 与 layers.list 隐藏已删除文稿的层，存储行仍在。readLexemeLinks 与 references.listLinks 隐藏已删除文稿上的词条链接，存储行仍在。切词、改图、创建、边界、切分、合并、备注、开任务、时间映射、切语素和提交分析在已删除文稿上仍由写入触发器报 manuscript is deleted，恢复后可以再写。删除前的分析候选在删除和恢复后接受仍报 analysis candidate is stale。语料查询不返回已删除文稿。不设 includeDeleted，也不把过滤只留在 dispatcher。
优先复用已存在守卫；同语义重复才提 scopeGuards。写前在所属事务内核对祖先和生命周期，不依赖 UI 或较早检查。
普通读取按查询过滤；专用状态/恢复/清除保留明确的内部或具名读取能力，禁止统一全局过滤误伤清除。
旧任务的凭据与当前状态分别检查，恢复后旧任务仍无效；模型范围检查与文稿/语段归属不能互相替代。
退出：从直接领域调用和 IPC 两路验证删除守卫，普通内容查询无泄漏，保留期/恢复/清除合法；无需 UI 再补检查。

### W3b：创建与必填字段不可分离

落位：customFields.ts 及全部宿主 creator、foreignImport.ts、modelRuns.ts、analysisImport.ts 等实际创建路径。
requiredCreateReadback.test.ts 已验证 13 个现有 helper 宿主缺值拒绝/回滚、合法创建和关闭重开读回；这只是部分证据，不能勾掉 W3b。
project 缺值回滚已落地。ensureProjectIdentity 仍无 fieldValues。没有项目行时，插入和必填检查在同一事务里；必填项目字段没有值就报 project is missing a required field，项目行和字段值一起回滚，关闭重开后仍没有项目行。已有项目行则直接返回，不因缺值拒绝。入口还不能在创建时写入合法必填值；类型签名不能当作运行时拒绝多传参数。source 没有具名创建函数，不新增入口。
source 仍直接 INSERT。分析图节点和关系分开验证，沿用 assertStoredCustomFields，失败后旧图、投影及相关记录不变。一种导入、一条接受先证明完整事务；批量即使调用同一函数，仍核对外层没有逐项提交。先确认该宿主自己的字段合同，再决定初始化落位，不擅自填默认值。
最终阶段仍要：继续使用 writeRequiredFieldValues，具名 creator 的外部成功包含合法初始化及读回；组合操作在事务内创建，不造 create(host,values)。每宿主缺必填值整次回滚、无错误宿主字段、合法值关闭重开可读；导入和批量不新增逐行独立提交。已有数据损坏可报告并拒绝相关写入，不顺手批量修复或填默认值。本轮不先做一份宿主总清单。

### W4a：图编辑作为完整领域操作

本轮先对改正文注入一次写入后失败，重开后代际和图仍是前态。与改图是同一段代码时才提取共用步骤。跨语段引用不实施。下面的矩阵和全部注入点是最终阶段退出，不是下一刀。
落位：units.ts、unitSpan.ts、analysis.ts、analysisCandidates.ts、analysisRestore.ts、modelRuns.ts、analysisImport.ts。
按改正文、接受、恢复、切分、合并分别定义“保留/迁移/失效”矩阵：图节点、surfaceParts、词项链接、备注、字段引用、快照和代际。
保持图为真值，线性投影同事务生成；移除多处手工重建的同义逻辑，不把完整业务硬塞进一个万能 graph mutation。
退出：首写后、快照后、投影后、关联更新后注入失败，重开全部回到前态；成功后图与投影、引用一致，撤销不覆盖后续编辑。
跨语段自定义引用是否随切分迁移若合同未定，列独立决定；已有 speculative 红灯不能当作已确认缺陷或擅自修复依据。

### W4b：会话一步撤销与编辑协调

落位：projectSession.ts、sessionEdit.ts、desktopCall.ts。领域 SQL 函数不读取全局会话。
sessionEdit 已管理一步内存状态，领域模块不读它；崩溃即丢、不改 user_version。
`reopenDesktopSession` 只在 `openProject` 抛错时调用 `expireSessionEdit()`，随后原样抛出；成功重开不清槽。`sessionEdit` 不引用 `projectSession`。
失败用例在下一次 `openDesktopSession` 之前，对一份正文已提交后的一致副本调用 `undoSessionEdit`。副本与槽里的 `after` 一致，未清槽时撤销会改写它。断言是 `unit text undo is empty`，且副本正文不变；`undo is stale` 也会清槽且不改数据，不能当作通过。成功重开后仍可撤销。
把成功编辑返回 undo、会话记忆和逆操作选择集中；完整列出操作的 preserve/clear/replace 行为。
先刻画失败尝试、无变化、读操作、reopen 的既有行为；若需改变失效时机，独立确认，不能混入等价搬迁。
退出：交错编辑、失败、跨会话、旧凭据、切换项目、关闭重开都不能执行错误逆操作；进程崩溃仍不承诺撤销恢复。

### W5：文件、锁与主进程副作用收口

本轮顺序不取代最终目标。本轮 W5a 只验证一次导入失败仅删除本次创建的文件，不动原件和已有哈希对象。W5b 只验证录音收尾的一个失败状态在重开后保持不变，不并入附件生命周期。W5c 项目锁沿用现有测试。
最终阶段仍要：统一实际重复的受保护文件身份和目标发布检查，保留 dev+ino、符号链接、空目标、ZIP 中央目录限制；逐格式保持来源身份和未投影内容报告；附件与录音只共享身份核对，分别保留最后引用和录音保留期。零链接不等于文件已删，路径缺失不等于已送垃圾箱。数据库/文件各阶段失败与重开、同路径替换/硬链接、清除期间重关联/重新登记仍须通过。真实 Electron 的文件选择、媒体读取和垃圾箱延后到 W7，不从最终门禁删除。
不引入全局文件事务框架，不自动收集删除 orphan；物理断电耐久性和跨平台 syscall 差异只按实际证据声明。

### W6：剩余契约迁移、旁路封口与删除过渡代码

按项目/媒体 → 文稿/层/语段 → 分析/运行 → 字段/词典 → 备注/对话/目录 → 交换/清除逐域迁移，每域独立 typecheck/回归。
扩展前先消除 runContract 逐键执行/记忆 case 和 UnitTextUndo 专用类型约束；不再迁一套四键试点，不以 never 声称消除了重复注册。
删除 METHODS、KEEPS_UNIT_TEXT_UNDO 和已替代 switch；contract 定义键，handler 映射强制穷尽，client 不再手写独立结果泛型。
脚本使用同一领域业务入口及项目锁，不要求强行走渲染会话/IPC；批处理事务边界按既有业务合同，不按每条 helper 提交。
结构守卫阻止 renderer 服务端运行时导入、脚本/页面调用内部 InTransaction 步骤、未登记外部操作、迁移后旧分派残留。
不靠 regex 断言“出现 guard/helper”证明正确；行为矩阵仍必须通过。最终不得留下永久新旧双实现和新旧白名单。
退出：新增一种操作只需合同+实现+必要业务测试；新增创建路径不另记初始化清单；无未归属业务规则。

### W7：集成验收与文档收口

完整链：创建 → 必填字段 → 编辑/分析 → 撤销 → 删除/恢复 → 迟到任务拒绝 → 导出/导入 → 备份/恢复 → 关闭重开 → 清除收尾。
覆盖提交后响应丢失：UI/调用方看到未知结果且不自动重试，已有事实可查；不能以单测全绿代替 Electron 验收。
同一合成数据对拍前后业务结果、SQL/事务/IPC 数和耗时；可重复的延迟/内存退化必须解释并修正或单列接受，不给未经测量的绝对性能承诺。
对照更新主路线图 M6-D/M7 的实际证据和过时规格状态；未验收的发布/真实平台不勾完成，不借本重构关闭旧路径退出任务。
退出：所有必需门禁通过，待决定项明确独立出本轮范围，过渡实现清零，测试/结构守卫保留，完成后删除本计划和规格。

## 依赖与交付控制

A、B、W2 故障注入、W3a 和 W3b project 缺值回滚已封口，不借此迁新键。project 入口仍无 fieldValues，不能在创建时写入合法必填值。source 没有具名创建函数，缺值回滚未做，不新增入口。分析节点、关系和转写接受的缺值回滚已落地。媒体到附件、自定义字段、来源、发音人、会话、消息、书目和引用已迁入目录。下一刀是 W6 分析。W0 和 W5 正文里的宽基线、完整文件验收和 Electron 媒体路径是最终阶段目标，不是本轮每一刀的范围；Electron 媒体路径留在 W7 门禁。不新写入口散文，不提取共用图函数。
一个阶段可多次小提交，每次只迁一个有完整验收的领域。先保留业务结果测试，再替换实现，最后删除旧代码。
不承诺一次大提交完成；每批失败可回退代码，无格式迁移。只有实际并行执行时才分配互不重叠所有权，本文不预设多 agent 编排。
若风险评估要求新旧试用，遵守 flag 默认 false 和一周自用规则，单次操作只走一路；不得为了比较而双写真实数据。

## 验证命令与证据

每批：npm run typecheck；npx vitest run <触及领域测试>；npx eslint <触及文件>；git diff --check。
最终：npx vitest run src/db src/desktop；npm run check:schema-freeze；npm run check:desktop-format-freeze。
入口：npm run check:script-desktop-callers；npm run check:old-path-exit；npm run check:db-transaction-facade；npm run check:direct-db-imports。
结构：npm run check:architecture-guard；npm run check:agent-evals:smoke；npm run check:dev-agent-workflow-verify；npm run check:docs-governance。
宿主：npm run test:e2e:chromium；npm run test:e2e:desktop-project；触 src/ai 则 npm run check:agent-evals:full。
现有 check:db-transaction-facade 和 check:direct-db-imports 不覆盖 desktop dispatcher→领域函数的约束落位，不能用它们替代集合和业务旁路验收。
新边界检查优先接入现有架构守卫；循环依赖检查使用当前仓库实际存在工具，不抄旧文档里缺失的脚本。
每条记录基线 commit、命令、结果、覆盖范围、失败归因与未验证项；原生模块 ABI/环境阻塞不能改写成产品通过。

## 本轮封口与下一刀

A、B、getUnit、readAnalysisState、备注、字段、可接受任务名单、层、词条链接和分析迟到写已落地，没有迁新操作，没有改跨语段引用，没有重拆 fieldDelivery。

1. A：`operationCatalog.baseline.ts` 固定 `5fbc66f8` 的 128 个键。`operationContract.test.ts` 核对 `METHODS` 与合同键各自无重复、互斥，并集等于这份目录。测试不读 Git，也不普查生产入口。
2. B：`reopenDesktopSession` 仅在 `openProject` 失败时 `expireSessionEdit()` 后原样抛出。`unitTextUndo.test.ts` 在下一次 `openDesktopSession` 之前，对改后正文的文件副本调用 `undoSessionEdit`：错误是 `unit text undo is empty`，副本正文仍是改后的值。成功重开后仍可撤销。

3. getUnit：普通读和 IPC `units.get` 隐藏已删除文稿的语段。`readStoredUnit` 给写入、清除、迁移和保留期核对。直接调用与 IPC 都测了；恢复后普通读重新可见。正文未改仍保留上一步撤销，留在 W4b。

4. readAnalysisState：领域入口拒绝已删除文稿，错误仍是 `manuscript is deleted`。`readAnalysisMaterial` 仍返回存储行。直接调用与 IPC 都测了；恢复后重新可见。

5. 备注：`readContentNote` 与 `notes.list` 隐藏已删除文稿的备注。`readStoredContentNote` 给更新和删除，错误仍是 `manuscript is deleted`。项目备注仍可见。直接调用与 IPC 都测了；恢复后重新可见。

6. 字段：`readFieldValue` 隐藏已删除文稿上的文稿、层、语段和备注字段值。`readStoredFieldValue` 与 `locateValues` 给写入和清除。`missingUnitFields` 把藏起的必填值视为未填。直接调用与 IPC 都测了；恢复后重新可见。写入仍报 `manuscript is deleted`。

7. 任务名单：`listAcceptableRuns` 只含未删除且代际仍匹配的运行。`modelRuns.get` 仍返回旧任务。删除后、恢复后、关闭重开后名单都是空的；新完成的任务重新出现。迟到接受仍报 `transcription run is stale`。

8. 层：`getLayer` 与 `layers.list` 隐藏已删除文稿的层。存储行仍在。直接调用与 IPC 都测了；关闭重开后仍隐藏，恢复后重新可见。迟到创建仍报 `manuscript is deleted`，恢复后可以再建。

9. 词条链接：`readLexemeLinks` 与 `references.listLinks` 隐藏已删除文稿上的链接。另一份文稿的链接仍在，存储行仍在。关闭重开后仍隐藏，恢复后重新可见。迟到改链仍报 `manuscript is deleted`。

10. 分析迟到写：切词和改图在已删除文稿上仍报 `manuscript is deleted`。直接调用与 IPC 都测了。关闭重开后仍拒绝，图指纹不变，恢复后可以再写。写入实现没有改，这一组是把已有触发器锁进测试。

11. 其余领域写：创建语段、改边界、切分、合并、新建备注、开任务、改时间映射、切语素和提交分析，在已删除文稿上仍报 `manuscript is deleted`。直接调用与 IPC 都测了。关闭重开后切分仍拒绝，边界时间不变，恢复后可以再建语段。删除前提交的候选，删除后和恢复后接受都报 `analysis candidate is stale`。语料查询不返回已删除文稿，恢复后重新可见。写入实现没有改。字段值删除仍走清除路径，没有 DELETE 触发器，本轮不改。

12. 补交故障：source 的事务中止把正文和 pending 一起回滚。诊断文件已经收件、项目里的确认更新失败时，状态仍是 pending，修订不变。关闭重开后再补交只确认一次，再次补交不增加回执。协议实现没有改。

W3a 到 W5、W6 预备、媒体到附件、自定义字段、来源、发音人、会话、消息、书目和引用已收口。source 没有具名创建函数。下一刀是 W6 分析。W0、W5 的宽基线和 Electron 媒体路径留在最终阶段，不从 W7 门禁删除。本轮没有重跑全域回归或 Electron。

证据：`npm run typecheck` 通过。`npx vitest run src/db/desktop/sourceFields.test.ts` 为 5 项通过。`npx eslint` 覆盖本切片测试，`git diff --check` 通过。`npm run check:docs-governance` 通过。上一批文稿删除为 19 项。
