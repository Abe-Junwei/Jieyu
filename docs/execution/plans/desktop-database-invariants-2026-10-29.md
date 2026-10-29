---
title: 单库数据库业务约束重构方案
doc_type: execution-plan
status: draft
owner: repo
last_reviewed: 2026-10-29
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

本次检查基线：分支 feat/desktop-single-library-page-paths，HEAD 5fbc66f8，规划前工作区干净。
既有修复按当前代码保留；历史漏洞只作为回归资产，不宣称仍然存在。本轮未重跑产品测试，之前测试数字不作新基线。
现有 desktopCall 的方法表、switch、撤销保留集合与 client 字符串分散维护；四域字段 patch/补交重复；必填字段 helper 已共用但入口必须记得调用。
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
| 撤销不会执行陈旧逆操作 | sessionEdits + projectSession | 所有保留/清除/产生 undo 的操作 | 操作序列、失败、切换、关闭重开 |

W0 把每行展开到全部实际入口，标明生产、脚本、内部、测试和不可达旧路径；禁止只靠方法名或文件存在勾覆盖。

## 分波交付

### W0：固定基线与业务结果测试

落位：现有 __audit__/*.test.ts、领域测试、现有守卫配置；证据保存在会话目录，叙述报告不放 audits/。
列 entry → parser → domain → transaction → effects → readback；标明谁能绕过 dispatcher 直接调用领域函数。
历史反例按领域迁入常规测试，先证明新测试仍能捕获原缺陷，再删除已被替代的审查测试；禁止整目录直接删除。
用合成小项目和较大项目记录查询耗时、写入耗时、SQL/事务数、IPC 数、导入峰值内存、renderer 服务端依赖。
退出：基线测试结果与现有失败归因齐；每条不变量至少有真实库反例/成功路径，性能数据可复跑。

### W1：类型化操作合同试点

落位：operationContract.ts、client.ts、desktopCall.ts。试点是 project.get、layers.create、units.updateText、media.finishCleanup。handler 留在 desktopCall.ts，不另建 operationHandlers.ts。
输入/输出与显式 undo policy 从一个合同约束；主进程保留运行时 parser 和 knownKeys，不把 Node/fs/数据库带入 renderer。
现有 named client 包装保留；once<T> 改为按键推导，不靠调用者自行宣称返回类型。
迁移中只走一个 handler；保留未迁移旧分派且其键集合由合同校验互斥完备，过渡层须在 W6 删除。
退出：试点不新增第四份清单；未知键/额外参数/过期会话仍拒绝；业务结果、错误与撤销序列等价。
W1 不阻塞 W2/W3 的领域改造；新增操作先遵循试点合同，避免继续扩散目录。

### W2：四域修订与诊断补交共用协议

落位：sourceFields.ts → speakerFields.ts → conversationFields.ts → bibliographyFields.ts；复用 diagnosticDelivery.ts，共同步骤在 fieldDelivery.ts。
逐域替换，保留字段级冲突判断、空值语义、SQL 与读回；共享幂等查重、pending 记录、提交后交付与确认。
保持指纹、summary、event_seq 及 operationId 的已有兼容；不用统一序列化改变历史重放身份。
退出：同 id 同输入不重复修改/推进修订；不同输入拒绝；多字段任一冲突全回滚；无变化不创建虚假交付。
覆盖项目事务失败、提交后诊断不可用、收件已成功但确认未写、关闭重开后 redeliver；只补日志不重放业务。

### W3a：生命周期与对象范围收口

落位：manuscripts/layers/units、analysisRestore/modelRuns、notes/customFields/customFieldPurge、lexicon/lexemeLink/corpusQuery 等实际入口。
优先复用已存在守卫；同语义重复才提 scopeGuards。写前在所属事务内核对祖先和生命周期，不依赖 UI 或较早检查。
普通读取按查询过滤；专用状态/恢复/清除保留明确的内部或具名读取能力，禁止统一全局过滤误伤清除。
旧任务的凭据与当前状态分别检查，恢复后旧任务仍无效；模型范围检查与文稿/语段归属不能互相替代。
退出：从直接领域调用和 IPC 两路验证删除守卫，普通内容查询无泄漏，保留期/恢复/清除合法；无需 UI 再补检查。

### W3b：创建与必填字段不可分离

落位：customFields.ts 及全部宿主 creator、foreignImport.ts、modelRuns.ts、analysisImport.ts 等实际创建路径。
先列清所有支持字段的宿主和创建方式，不仅列 UI 可见对象；涵盖图节点、词条/义项等实际支持范围。
收窄宿主类型；继续使用现有 writeRequiredFieldValues。具名 creator 的外部成功必须包含合法初始化及读回。
组合操作使用事务内创建步骤，外部不得先创建再补字段；只在复用足够时提取该步骤，不造 create(host,values)。
退出：每宿主缺必填值整次回滚、无错误宿主字段、合法值关闭重开可读；导入/批量共享规则且不新增逐行独立提交。
已有数据损坏可报告并拒绝相关写入，不顺手批量修复或填默认值。

### W4a：图编辑作为完整领域操作

落位：units.ts、unitSpan.ts、analysis.ts、analysisCandidates.ts、analysisRestore.ts、modelRuns.ts、analysisImport.ts。
按改正文、接受、恢复、切分、合并分别定义“保留/迁移/失效”矩阵：图节点、surfaceParts、词项链接、备注、字段引用、快照和代际。
保持图为真值，线性投影同事务生成；移除多处手工重建的同义逻辑，不把完整业务硬塞进一个万能 graph mutation。
退出：首写后、快照后、投影后、关联更新后注入失败，重开全部回到前态；成功后图与投影、引用一致，撤销不覆盖后续编辑。
跨语段自定义引用是否随切分迁移若合同未定，列独立决定；已有 speculative 红灯不能当作已确认缺陷或擅自修复依据。

### W4b：会话一步撤销与编辑协调

落位：projectSession.ts、sessionEdit.ts、desktopCall.ts。领域 SQL 函数不读取全局会话。
把成功编辑返回 undo、会话记忆和逆操作选择集中；完整列出操作的 preserve/clear/replace 行为。
先刻画失败尝试、无变化、读操作、reopen 的既有行为；若需改变失效时机，独立确认，不能混入等价搬迁。
退出：交错编辑、失败、跨会话、旧凭据、切换项目、关闭重开都不能执行错误逆操作；进程崩溃仍不承诺撤销恢复。

### W5：文件、锁与主进程副作用收口

W5a：projectExchange/foreignImport/dailyBackup/zipBounds；统一实际重复的受保护文件身份和目标发布检查，保留 dev+ino、符号链接、空目标、ZIP 中央目录限制。
导入明确区分本次创建文件与既有复用文件；失败仅撤销本次拥有的文件，不删除原件保留或既有哈希对象。逐格式保持来源身份和未投影内容报告。
W5b：attachments/mediaCleanup/mediaReregister；只共享身份核对，分别保留附件最后引用和录音保留期协议。零链接不等于文件已删，路径缺失不等于已送垃圾箱。
W5c：projectLock/projectSession/desktopMediaGrant 与 electron main/preload；核对多进程竞争、打开失败、项目切换/重载后的授权和资源释放。
退出：数据库/文件各阶段失败与重开、同路径替换/硬链接、清除期间重关联/重新登记均通过；真实 Electron 核对文件选择、媒体读取与垃圾箱已知结果。
不引入全局文件事务框架，不自动收集删除 orphan；物理断电耐久性和跨平台 syscall 差异只按实际证据声明。

### W6：剩余契约迁移、旁路封口与删除过渡代码

按项目/媒体 → 文稿/层/语段 → 分析/运行 → 字段/词典 → 备注/对话/目录 → 交换/清除逐域迁移，每域独立 typecheck/回归。
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

W0 → W1 试点；W2 与 W3 可独立推进；W3 → W4；W5 基于 W0 可独立；W1 + 领域阶段 → W6 → W7。
一个阶段可多次小提交，每次只迁一个有完整验收的领域。先保留业务结果测试，再替换实现，最后删除旧代码。
不承诺一次大提交完成；每批失败可回退代码，无格式迁移。只有实际并行执行时才分配互不重叠所有权，本文不预设多 agent 编排。
若风险评估要求新旧试用，遵守 flag 默认 false 和一周自用规则，单次操作只走一路；不得为了比较而双写真实数据。

## 验证命令与证据

每批：npm run typecheck；npx vitest run <触及领域测试>；npx eslint <触及文件>；git diff --check。
最终：npx vitest run src/db src/desktop；npm run check:schema-freeze；npm run check:desktop-format-freeze。
入口：npm run check:script-desktop-callers；npm run check:old-path-exit；npm run check:db-transaction-facade；npm run check:direct-db-imports。
结构：npm run check:architecture-guard；npm run check:agent-evals:smoke；npm run check:dev-agent-workflow-verify；npm run check:docs-governance。
宿主：npm run test:e2e:chromium；npm run test:e2e:desktop-project；触 src/ai 则 npm run check:agent-evals:full。
新边界检查优先接入现有架构守卫；循环依赖检查使用当前仓库实际存在工具，不抄旧文档里缺失的脚本。
每条记录基线 commit、命令、结果、覆盖范围、失败归因与未验证项；原生模块 ABI/环境阻塞不能改写成产品通过。

## 本轮交付与下一步

已落地一小批，未做 W0，也没有把其余操作迁进合同：

- W1：`operationContract.ts` 覆盖 project.get、layers.create、units.updateText、media.finishCleanup。client 按合同推导结果。handler 仍在 desktopCall.ts。
- W2：`fieldDelivery.ts`。四域仍各自保留列、冲突判断和指纹。
- W3b：13 个具名创建入口有缺值拒绝、合法成功、失败回滚、重开读回。没有通用 create，导入和批量未收口。
- W4b：`sessionEdit.ts` 记住、过期并执行一步撤销。崩溃不恢复。user_version 仍是 27。

未勾的 W0、W3a、W4a、W5、W6、W7 仍按本计划推进。不把目录全量迁移设为下一步的前置。
