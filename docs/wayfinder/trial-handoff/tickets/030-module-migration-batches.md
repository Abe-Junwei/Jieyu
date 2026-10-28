---
title: 桌面领域读写接替与旧 db 路径退出
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: []
execution_gate: M4-complete-domain-api-ready
issue: https://github.com/Abe-Junwei/Jieyu/issues/280
---

# 桌面领域读写接替与旧 db 路径退出


<!-- desktop-sqlite-slices:v1:start -->
## 当前可执行切片与关闭条件（2026-10-25 本轮重排）

旧桶导入棘轮 0 的证据保留；本单按真实入口→写入→副作用→关闭重开读回验收，搬到 src/db 但仍用 Dexie 不算接替。M4 后按领域/API 就绪推进，不等 #275 终验。

- [x] M4：项目入口与首个编辑闭环无 Dexie/.jyd fallback，给真实 Electron 证据。macOS 已走通。Linux/Windows 未跑。
- [x] M5-A 目录：项目语言/正字法/别名/桥、必要共用定义与模板实例；引用有效，多语内容重开完整。user_version 升到 3，旧文件只拒绝。
- [x] M5-B 词典：DMLex 正文、Jieyu 扩展、稳定嵌套 id；非法引用整次拒绝，附件不偷跑未定协议。user_version 升到 4，旧文件只拒绝。
- [ ] M5-C 分析：R1 字段合同确认后实现共同提交，再接人工/导入/首次接受；units.updateText 的正文/快照/清图/关联卸下/代际同事务。依 ADR-0089 多条历史 accepted 可保留，旧候选/任务不能覆盖新状态。
- [ ] M5-D 备注：九类目标逐类决定去向并接实际入口；译文正文与评论分开，脱离关联可查询，恢复保留后来编辑；与 C 联合验收。
- [ ] M5-E 其他既有域：说话人/来源、对话、设置/查询及现有 AI 写路径按独立小片验收；审计失败语义在相关路径前确认，不把整个项目塞图 JSON。
- [ ] M5-F/G：配合 #303/#305/#306 接转写结果和运行记录，基础语料查询正文/gloss/POS/义项且不建第二份语料真值。
- [ ] M5-H 附件：R5 协议确认后文件发布/解除/ref_count/持久收尾，覆盖崩溃和重试；R6 每域逐列收口，不继承旧迁移丢字段。
- [ ] M6-D：首发生产入口、后台任务、读回、事件/缓存/撤销及脚本使用清单齐，才可报告实际接替完成。外壳和选路已接上：Electron 不挂旧库检查、定时备份和旧目录弹窗，桌面页在旧项目门禁外选路，转写入口在 Electron 里早退。正文的一步逆操作已记下。语段切分和合并的一步逆操作已记下。说话人可以一次改派，备注和目录的列表与编辑已记下。首页打开文件夹后能读到项目名，关掉再打开仍在。语料页定位时带上文稿、层和语段。导入当前打开的项目不重新开库，文件选择和导出保存已接上。分析页已能接受真实建议并恢复快照，核对的是当前凭据。对话可以创建、列出和选择。追加消息和改标题都要求对话已经存在。语言目录、正字法和桥从桌面会话打开，不经过旧项目门禁。结构模板没有桌面表，不打开旧页。协作日志还没做。路由接上不代替这些终验条件。2026-10-28 核对后仍不齐：文件夹页和桌面标注页已走主进程；模型宿主可以用模拟服务核对声明、回环地址、响应、超时和取消；不接真实引擎，不开候选面板，不写 model_runs；旧转写页仍在旧库；词典界面在已打开的桌面项目里列出、改正和新建词条，关掉再打开仍在；附件画面未开；脚本可以把 EAF、FlexText、TextGrid、Toolbox、LIFT 和 JYB 导入桌面库，原文件留下，放不下的打印名称和原因；不写当天备份；旧导入页不改；没有定时任务；一条终验已串起项目、词典、语料、转写事实、合成示例、JYT 交换和每日备份；scripts 不打开桌面会话。
- [ ] M7-C 退出：对应替代实现、脚本/构建/CI/E2E 与数据保留核对齐后才删旧模块；不等已取消 #326，不误删独立 userData/协作需求。

目录/词典先提供分析所需引用；共同入口只等相关合同，不把所有领域决定变为 M1 前置。每片附真实测试/关闭重开/失败注入与提交或 PR。M4、M5-A 与 M5-B 已勾上。下一刀 M5-C。其余清单当前未完成。


详细前置/验收见[单库切片清单](../../../execution/plans/desktop-project-sqlite-2026-10-25.md#可领取切片与交付顺序2026-10-25-本轮重排)。本轮同步不代表实现完成；下方较早范围保留，冲突以本节为准。
<!-- desktop-sqlite-slices:v1:end -->

## 2026-10-25 已确认范围

桶导入计数 0 只证明旧棘轮达标，仍按 M4/M5 逐领域核对生产读写、后台任务与重开读回；不得把迁到 src/db 但仍用 Dexie 的代码当作桌面完成。 依据 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[ADR-0087](../../../adr/0087-project-deletion-retention-and-media-cleanup.md) 和[单库计划](../../../execution/plans/desktop-project-sqlite-2026-10-25.md)。GitHub 已于 2026-10-25 写入当前范围。以下原 Question 留作历史输入，冲突处按本节执行。

## Question

按 [ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md) 第 3 条与 [#274](https://github.com/Abe-Junwei/Jieyu/issues/274)（ADR-0048）：列出非测试代码里直接 import db / Dexie 的模块，按领域分批，**计划 + 逐批执行**（用户 2026-10-14 定，取代「只出计划」）。

规则：
- 每批一个 PR，迁完跑 `npm run check:direct-db-imports:write-baseline` 下调基线；进度评论记在本 issue。
- ADR-0048 已于 2026-10-15 确认，带事务的写入可以迁；多表写入写成存储接口上的一个操作。
- 关闭条件：`scripts/direct-db-imports-baseline.json` 的 `maxDirectDbModules` 降到 0，或只剩写明白名单的接口实现模块（Dexie / SQLite 适配层本身若必须 import `db`，在本单白名单里写明）。

## 进度

- 2026-10-18 第 1 批：只从 `db` 桶拿类型的模块改从 `db/types` 或 `db/engine` 导入。基线 297 → 129。剩下的是仍有值导入的模块。
- 2026-10-18 第 2 批：项目行读取和跨项目归属查询进存储接口（`readProject`、`listForeignOwnedUnits` / `Layers` / `Media`）。调用方：异体字行、缩写表、词类表、`projectOwnershipQueries`。基线 129 → 125。
- 2026-10-18 第 3 批：轨道显示状态 `listTrackEntities` / `putTrackEntity`（写入后读回，已有行不能改 `textId`）。`TrackEntityStore` 不再调用 `getDb`。基线 125 → 124。
- 2026-10-18 第 4 批：`readLayerUnit`（引用解析）、`countAnnotationDocuments`（多文稿协作门）。基线 124 → 122。
- 2026-10-18 第 5 批：层树父级函数和文档类型改从 `db/types` 导入，不再经过 `db` 桶。基线 122 → 111。
- 2026-10-18 第 6 批：来源登记 `listSourceRecords` / `registerImportedSource` / `renameSourceRecord` / `linkSourceRecordMedia`。哈希仍在事务外，登记和读回在同一个事务里。`sourceRecordService` 不再调用 `getDb`。基线 111 → 110。
- 2026-10-18 第 7 批：层约束、层排序、层段读取、EAF 附加层和 `LinguisticService` 的类型再导出改从 `db/types` 导入。这些文件不读库。基线 110 → 103。
- 2026-10-18 第 8 批：首页进度和项目概览读取语段元数据、译文快照、锚点计数和词计数，改走存储接口。默认转写层仍由层服务打开数据库。`homeTranscriptionRecordProgress` 和 `projectOverview` 不再从 `db` 桶导入。基线 103 → 101。
- 2026-10-18 第 9 批：采纳结果和会话沙箱的审计行改走 `audit.insertAuditLog`。
- 2026-10-18 第 10 批：媒体按项目列出和保存改走存储接口，保存后按 id 读回。
- 2026-10-18 第 11 批：语料分析工具按项目读取词和词素。
- 2026-10-18 第 12 批：写入后的存在性读回（句段、层、助手消息正文）改走存储接口。第 9–12 批合计基线 101 → 95。
- 2026-10-18 第 13 批：备注写入和按目标列出、项目媒体 id、会话最近消息、审计行按 collection 读取，改走存储接口。基线 95 → 91。
- 2026-10-18 第 14 批：MCP 工具调用审计写入、代理产物和它的审计行（同一事务）改走存储接口。基线 91 → 89。
- 2026-10-18 第 15 批：最近会话列表、会话标题补丁、清空会话消息并回写 updatedAt，改走存储接口。基线 89 → 86。
- 2026-10-18 第 16 批：运行时报告从审计行收集采纳、引用、相关性和字段计数，改走已有的按 collection 读取。基线 86 → 85。
- 2026-10-18 第 17 批：工具决策和意图审计写入走 `audit.insertAuditLog`，按 collection、field、requestId 查已执行决策。基线 85 → 84。
- 2026-10-18 第 18 批：生产代码不再从 `db` 桶导入。表访问在 `src/db/storagePort*.ts`，原来的服务和 hook 改调用这些模块。句段表白名单跟着挪到这些存储模块。基线 84 → 0。
