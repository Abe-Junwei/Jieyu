---
title: 单库业务约束收口 requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-29
source_of_truth: desktop-database-invariants-spec
depends_on:
  - ../../../adr/0085-desktop-project-one-sqlite.md
  - ../../../adr/0091-field-revisions-diagnostic-delivery-and-later-milestones.md
---

# Requirements — 单库业务约束收口

## 1. What & Why

- 目标：具名操作成功即保证完整业务结果；新增入口不能轻易漏掉生命周期、必填字段、投影、诊断或文件身份检查。
- 触发：前轮反例已修复，但约束仍散落在 dispatcher、领域函数和导入脚本，容易在新入口重现。
- 范围：桌面 SQLite 调用契约、领域写入、普通读取、删除/恢复、导入交换、文件副作用、会话撤销及其生产/脚本入口。
- 保持：单 project.sqlite、现有具名 IPC 和返回语义、user_version 27、冻结 DDL/包格式；不新增自动业务重试。
- 范围外：旧 Dexie 迁移/删除、五个超长 hook、UI 改版、真实模型集成、持久撤销、安装发布和 CSP 政策改变。

## 2. 用户场景

1. 创建、修改或接受分析后关闭重开，正文、字段、图投影和必要记录一致；失败不留下半次业务写入。
2. 删除和恢复期间，普通查询不泄漏已删除内容；旧任务不能因恢复而重新取得写入资格。
3. 导入、备份、导出或清除失败后，原项目和既有文件仍可用，未知结果可被识别，不被误称成功。

## 3. 验收标准

- [ ] 所有可达操作有类型化输入/输出、运行时解析、会话要求和显式撤销策略；未知操作、额外键、越权对象仍被拒绝。
- [ ] 每种领域创建通过合法初始化入口完成，缺必填字段则对象和字段同回滚；包括导入及批量接受。
- [ ] 生命周期守卫在领域持久入口生效；普通读取、专用删除列表、清除内部读取有不同而明确的合同。
- [ ] 文本、图、线性投影、引用、快照和代际在所属操作同事务一致；未确定的引用迁移语义不擅自改变。
- [ ] 四域字段修改共用补交协议；同 operationId 同载荷幂等、异载荷冲突；诊断失败不重复业务写入。
- [ ] 文件发布与清除沿用现有状态机，关键崩溃点重开可判定；路径、硬链接、替换文件和 ZIP 限制保护保留。
- [ ] 撤销保持会话内一步语义；失败写入不产生可执行的错误逆操作；过期、切换和重开行为明确。
- [ ] 历史反例迁为常规回归；真实临时库写入→关闭→重开→读回，验证失败注入和提交后响应丢失。
- [ ] DDL/冻结记录/包格式不变；代码门禁、相关回归和真实 Electron 流程全部有当次证据才可宣称完成。

## 4. 受影响代码地图

| 类别 | 路径（均相对仓库根） | 改动性质 |
| --- | --- | --- |
| 契约/IPC | src/db/desktop/client.ts、desktopCall.ts、拟建 operationContract.ts、operationHandlers.ts | 契约与主进程装配收口 |
| 生命周期/创建 | manuscripts.ts、layers.ts、units.ts、media.ts、customFields.ts、conversations.ts、messages.ts、notes.ts、catalog.ts、speakers.ts、lexicon.ts | 领域入口保证完整结果 |
| 分析/撤销 | analysis*.ts、unitSpan.ts、modelRuns.ts、speakerAssign.ts、projectSession.ts | 事务责任、引用和会话状态 |
| 修订/诊断 | sourceFields.ts、speakerFields.ts、conversationFields.ts、bibliographyFields.ts、diagnosticDelivery.ts | 删除重复协议 |
| 文件/宿主 | projectExchange.ts、foreignImport.ts、attachments.ts、mediaCleanup.ts、dailyBackup.ts；src/desktop/skeleton/；electron/ | 公共保护与宿主验证 |
| 页面/脚本 | src/desktop/ 各 client 调用入口、scripts/import-desktop-file.mjs、scripts/desktop-project-flow.mjs | 适配现有具名接口 |
| 测试/守卫 | src/db/desktop/*.test.ts、__audit__/；scripts/check-*.mjs | 反例常规化、阻止旁路 |

## 5. 风险与退出

- 方案详见 [design](./design.md)；分波交付与退出条件详见 [执行计划](../../plans/desktop-database-invariants-2026-10-29.md)。
- 现有 ADR/旧规格保留其合同权威；本规格只负责重构验收，不把历史未完里程碑冒充已验收。
- 发现需要新持久状态或改变外部语义时，单列决定，不借重构绕过格式冻结；全部任务完成后删除本目录。
