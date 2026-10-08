---
title: 项目与文件组织、持久化调查及改进建议
doc_type: audit
status: draft
owner: repo
last_reviewed: 2026-10-08
---

# 项目与文件组织调查

本报告基于 2026-10-08 工作树静态检查。包含现有未提交改动；未运行浏览器破坏性操作、未修改业务代码。以下建议尚未成为架构决策。

## 1. 当前组织与数据流

| 概念 | 持久化/入口 | 已确认语义 |
| --- | --- | --- |
| 项目 | `src/db/types.ts` 的 TextDocType / texts | 标题、metadata、语言和权限；界面项目以 textId 定位 |
| 录音 | media_items，textId 外键 | 文件名、显示名称、URL/Blob、时长；不是操作系统文件夹 |
| 导入文稿来源 | texts.metadata.sourceFiles | id/name/format/mediaId/linkedMediaFilename；未在此记录原始字节或内容哈希 |
| 可编辑内容 | layer_units / layer_unit_contents 等 | 与导入文件记录分离；来源记录不等于独立文档内容容器 |
| 文件列表 | projectFileOps → projectSourceFiles → ProjectFileBrowser | 录音和来源记录的投影；无来源但已有单元时会生成合成文稿条目 |
| 语言资产/词典 | 独立领域表 | 存在项目作用域和共享语义，归档不能仅按所有表的 textId 过滤 |

代码目录遵循 pages/controller → app/service → db 的现有边界；实际存在 app 的数据库再导出门面，不能仅凭导入路径判定页面已与数据库解耦。UI 在 components，领域 hooks 已有子目录，AI/collaboration 有专属目录。保持现有目录约定，不引入 features/monorepo。

主要操作链：

1. 普通文稿导入：`useImportExport.importHandlers.ts` 解析并写领域数据，修复层约束，随后 `rememberImportedSourceFile` 写 metadata，再 `loadSnapshot`。来源写入位于主体导入之后；不能把来源登记失败理解为主体导入已回滚。
2. 列表读取：`listProjectFileViews` 分别读取录音与来源，再 `linkManuscriptsToAudio`；优先 mediaId，缺少时按文件名映射；最后排序。
3. 改名：`renameProjectAudio` 修改 details.displayName；`renameProjectSourceFile` 修改来源 name，保留原 id。两者均不会重命名操作系统文件。
4. 删除录音：`LinguisticService.cleanup.deleteAudioPreserveTimeline` 在事务内保留逻辑时间轴、移除音频 Blob，并处理占位媒体；这是已有业务约定，不能按普通附件级联删除内容。
5. 删除项目：`deleteProjectCascade` 事务清理项目图、媒体及项目级目录数据，最后删除 texts；跨库队列、缓存和全部历史记录是否清理仍待逐一验收。
6. 归档导出：`useImportExport.ts` 的 JYT/JYM 分支调用 `downloadJieyuArchive` → `exportToJieyuArchive` → `exportDatabaseAsJson`。该服务入口无 textId 参数，输出为整库快照；zip 只加入 mimetype、manifest 和快照（或加密快照），没有媒体文件条目。
7. 协作快照：`projectScopedSnapshot.ts` 按 textId 过滤关联图，具有独立排除集合；与完整可携带研究项目的依赖范围不等价。

## 2. 持久化和恢复边界

主库 jieyudb_v2，Dexie schema 54；JSON snapshot schema 4。媒体 Blob 在 media_items.details，词典附件在 lexeme_assets。另有恢复库、迁移备份库、声学缓存库、行为库和协作客户端状态库；设置/会话状态还使用 localStorage/sessionStorage。

JSON 导出剔除媒体/词典附件 Blob。恢复快照经整库导出后筛选核心集合，再序列化，超过 8 MiB 跳过；因此大小上限并不限制前面的全库读取成本。迁移前备份逐表 getAll 后存到同源独立库，失败时升级继续。不同备份类型不能互相替代，同源副本也不能抵御用户清除整个站点数据。

声学缓存已有条目数和字节上限，行为库已有 actionRecords 保留策略；不能称为所有分库都无清理。当前只看到启动请求 persist，未发现 storage.estimate 用量查询调用。完整性探测已有实现，但核心引用规则仅覆盖部分关系，不代表整个业务图一致性已验证。

## 3. 按证据与影响排序的问题

| ID | 优先级 | 证据和影响 | 验证状态 |
| --- | --- | --- | --- |
| F1 | P1 | sourceFileId 使用格式和小写文件名，upsert 按该 id 替换；同名不同内容来源被折叠 | 实现确认；真实导入重现待做 |
| F2 | P1 | linkManuscriptsToAudio 用 filename→id 单值 Map；同名录音按遍历顺序覆盖，显式 mediaId 也未在此校验是否存活 | 纯函数确认；UI/占位媒体行为待验收 |
| F3 | P1 | 来源登记读 texts 后整行 put，没有同一事务保护 read-modify-write；并发登记或编辑元数据存在丢更新窗口 | 静态风险；并发故障注入待做 |
| F4 | P1 | JYM/JYT 无项目范围参数，打包整库且不额外收录媒体；跨项目隔离与可播放恢复预期可能不符 | 服务与调用链确认；UI说明、空环境回读待做 |
| F5 | P1 | 原件来源记录、当前内容和合成条目共享“文稿”展示语义；缺少明确的来源到内容作用域映射 | 模型确认；应先定义行为再扩表 |
| F6 | P1 | 恢复超限静默跳过、迁移备份失败继续、当前格式限定导入 | 已有 ADR 决策；适用前提需更新，不直接认定丢数据 |
| F7 | P2 | 恢复/项目快照先全库导出再过滤；项目较小时仍受其他项目/AI记录体量影响 | 调用链确认；耗时和内存未测 |
| F8 | P2 | 代码地图同页含 v34/v53/v54，旧表名与错误定义路径 | 文档与当前实现对照确认 |

## 4. 外部实现调研与取舍

调研依据为官方公开文档，非这些项目的完整源码审计。

| 实现 | 官方做法 | Jieyu 可适配原则 |
| --- | --- | --- |
| [Zotero 集合](https://www.zotero.org/support/collections_and_tags) | 集合可共享同一条目；移出集合和删除条目有不同语义 | 显示分组、所有权、删除必须分开定义，不由目录树形状推断 |
| [Zotero 附件](https://www.zotero.org/support/attaching_files) | 区分存储文件与链接文件 | 明确受管媒体、外部引用、媒体缺失状态；原文件名与显示名分开 |
| [Joplin 架构](https://joplinapp.org/help/dev/spec/architecture/) | UI、服务和模型分层，本地数据库承载应用状态 | 复用 Jieyu 既有 service/db 分层，让领域服务负责完整写操作 |
| [Joplin 同步](https://joplinapp.org/help/dev/spec/sync/) | 同步器与目标存储接口分离，并维护同步状态 | 协作队列和领域实体各有职责，按协议处理重试和失败 |
| [Audacity 项目](https://manual.audacityteam.org/man/audacity_projects.html) | AUP3 项目统一保存，保存项目和导出音频有不同用途 | 把可继续编辑的项目归档与交换格式/渲染输出明确区分 |
| [MDN 配额](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | origin 配额、持久化授权、估算与超限处理 | 分库不能规避同源配额；备份应有站点外出口 |

建议适配这些语义，复用 Dexie、fflate、已有领域服务和归档入口。当前没有证据支持更换数据库、增加文件系统层或 CRDT。base64 全媒体内嵌 JSON 会增加内存和体积；原文件名不能充当实体身份；云同步不能自动等同完整备份。

## 5. 推荐目标模型（提案）

- 第一阶段沿用 texts 作为项目身份，不为命名清晰而迁移所有 textId。
- 来源记录获得独立稳定 ID；originalName 与 displayName 分离。新 ID 不从名称推导；旧 ID 保留以维持引用。
- 文件内容指纹用于识别重复候选，不直接承担所有文档身份；显式“重新导入/更新来源”和“作为新来源导入”应有不同规则。
- 关联使用已校验的 mediaId。文件名仅用于候选匹配；同名多候选不自动任选。有效的逻辑占位媒体仍可承载关联。
- 来源记录与层/内容的关联先明确作用域；不假设来源可以直接拥有全部单元，也不在没有引用证据时宣称能删除“该文稿全部内容”。
- 保留删音留轴语义；缺音、外部引用不可用和原始文稿未保存均应可辨识。
- 首批可保持 metadata 数组，使用事务修正写入。独立 source_documents 表只有在查询、独立生命周期或同步粒度确有需求时再引入。
- 当前项目归档必须包含依赖闭包及媒体清单；与整库备份分开。协作快照过滤器仅可复用图遍历思路，不能直接视为完整归档范围。

## 6. 分批实施计划

| 批次 | 类别/落位 | 内容与完成条件 |
| --- | --- | --- |
| A | derived/actions：projectSourceFiles.ts、projectFileOps.ts、对应测试 | 重现 F1–F3；稳定来源身份、无歧义关联、事务更新；改名和并发登记后读回均正确 |
| B | actions：useImportExport.importHandlers.ts、projectFileOps.ts | 导入成功与来源登记成功的状态一致；明确失败后重试规则和来源作用域；补导入后重载验收 |
| C | actions/derived：JymService.ts、db/projectScopedSnapshot.ts、归档调用方 | 先落 SDD 与归档 ADR，再实现项目范围、共享依赖及媒体清单；两项目隔离、空库回读与播放通过 |
| D | effect/state：SnapshotService.ts、db/io.ts、preMigrationBackup.ts、现有恢复 hooks | 按所需集合读取；暴露跳过/失败结果；明确备份失败策略与保留上限；故障注入不误报成功 |
| E | documentation/结构 | 更新代码地图；仅在 A–D 触及的热点内按职责拆分，保持现有导出面 |

涉及新 service/controller、schema 或 flag 的批次必须先补 requirements/design/tasks 三件套。批次 C/D 的破坏性升级、归档版本和兼容窗口需形成 ADR 后实施。此次报告不授权改变已有迁移链或清理用户数据。

## 7. 可执行验收清单

- 两份同名 EAF 内容不同：导入后来源是否各自可追踪，不能仅断言条目数。
- 两段同名音频：歧义关联不得静默选最后一个；明确选择后刷新仍指向相同 ID。
- 来源改名后重新导入：原始名称、显示名、身份和更新策略保持一致。
- 同时登记来源与编辑项目元信息：两项写入重查都存在。
- 删除音频后重载：时间轴、文本、来源关系仍在，音频不可播放且状态准确；重新挂音不重置时间码。
- 项目 A 导出：解包检查无项目 B 私有记录；在隔离空库导入后文本、层、词典链接、媒体哈希和播放可核对。
- 超过归档导入限制的输出：导出不得生成当前应用无法读回却报告完整成功的包；限额与流式方案需单独评估。
- 恢复快照超过 8 MiB、配额不足、迁移备份失败、浏览器刷新：状态明确，原业务数据保留。
- 项目删除：重查当前库及队列/缓存，保留共享资产，无活动队列重新写回已删数据。

实施验证命令：`npm run typecheck`；`npx vitest run src/utils/projectSourceFiles.test.ts src/services/projectFileOps.test.ts src/services/JymService.test.ts src/services/SnapshotService.test.ts`（projectFileOps 用例不存在则随 A 新增）；涉及 UI 路径跑 `npm run test:e2e:chromium`；结构调整跑 `npm run check:architecture-guard`；文档跑 `npm run check:docs-governance`。真实浏览器验收必须使用隔离测试库，不删除用户库。

## 8. 尚未验证

未执行真实浏览器双项目导入/导出、故障注入、内存测试和云同步。本文不会将静态风险称为已发生故障。跨库删除完整性与原件其他存储路径仍需继续追踪。首次实施优先 A 的可复现问题，结构搬移后置。
