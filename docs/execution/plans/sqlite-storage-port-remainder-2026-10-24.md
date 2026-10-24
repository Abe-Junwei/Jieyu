---
title: 存储接口剩余方法
doc_type: execution-plan
status: draft
owner: repo
last_reviewed: 2026-10-24
source_of_truth: sqlite-storage-port-remainder-plan
---

# 存储接口剩余方法

另一项目的层已于 2026-10-24 接受，记在 ADR-0082。其余决定还没接受。下一号 ADR 是 0083。规格里「其余」保持未勾。不开始 #325、#329、#280。

## 目标

#275 里还能用已有列做完的方法已经做完。剩下的方法继续拒绝，直到下面的决定被接受。本规划只把下一条可以单独落地的方法写成可执行合同；其余方法说明缺口，不给实现。

## 实施基线

2026-10-24 在分支 `cursor/sqlite-anchor-counts-53bb` 上核对。ADR-0081 在这个检出里。审计列表、另一项目的语段、锚点计数、词计数和产物创建时间的测试是 `npx vitest run src/db/sqliteAuditLogs.test.ts src/db/sqliteLayerUnitIds.test.ts src/db/sqliteAnchors.test.ts src/db/sqliteUnitTokens.test.ts src/db/sqliteAgentArtifacts.test.ts`，17 passed。当时 ADR 目录的下一号是 0082，本条写下后下一号是 0083。审查检出 `bd4e7017` 不在这个克隆里，没有为它补做前置切片。

## 全局约束

- 一次业务操作一次事务，提交后读回。读回失败不撤销。桌面端用 better-sqlite3。浏览器 Dexie 实现不改。
- 开关 sqliteStoragePortEnabled 默认关。主进程只认 JIEYU_SQLITE_STORAGE_PORT 的 1 或 true。
- user_version 保持 1。日志模式 DELETE。已有的 project.sqlite 和 .jyd 不做 ALTER。新列只出现在迁移脚本的 CREATE 末尾，迁移的 INSERT 和 SELECT 不读这列。
- 只扫项目目录顶层的 `*.jyd`，不进子目录。application_id 不对就拒绝。同一个编号出现在两份文稿里就拒绝，已有行留下。
- src/db/sqliteStoragePort.ts 保持少于 300 行。新方法用助手函数展开，不在端口文件里展开 SQL。
- 不读、不上传、不粘贴木雅语料。不发明 model_runs 以外的运行记录，不把引用、推理或上下文快照写进消息行。

## 已经落地，本规划不重做

以下前置范围已在本分支核对，见「实施基线」：回合、审计的写入和按 id 读取、审计列表、说话人分配、正则拆分、轨道、来源记录、录音行、另一项目的录音、去掉空录音、文稿改挂录音、同一份文稿里的语段关系、会话和消息、语段编号、另一项目的语段、锚点计数、词计数、产物创建时间。fingerprintTarget 仍返回 undefined。

## 核对过的事实

- 浏览器里的层是 tier_definitions。listForeignOwnedLayers 用每一行自己的 textId，缺行跳过。调用方是 src/collaboration/cloud/CollaborationProjectRemoteMutationService.ts。开关关掉时这条路径仍走 Dexie。
- .jyd 的 layers 只有 id、key、language_id、orthography_id。没有 text_id，没有层名称、内容类型和时间。
- meta.id 是这份文稿的编号。迁移把 manuscript.id 写入这一列，replaceManuscriptAudio 用它找文件。样例规划里它是 doc-1，和 project 行的编号不是同一字段。一个项目文件夹可以有多份 .jyd。所以 meta.id 不能当成层的项目编号。
- project 行是 id、name、speaker_ids_json。TextDocType 要多语言标题，以及 createdAt、updatedAt。
- units 有 text_id、start_time、end_time、updated_at，没有 created_at，也没有转写正文。正文在 unit_contents.text，是普通文本。LayerUnitDocType 要求 createdAt，转写是另一套结构。
- tokens 和 morphemes 的 form 是普通文本。词计数已经连到 units.text_id。本分支的前置测试已通过。整行列表要的是 UnitTokenDocType / UnitMorphemeDocType。
- 两处 user_notes 都是 id、target_type、target_id、text。ADR-0062 第 3 条只定了行跟着被指对象走，没有把活文档映到这些列上。
- 迁移里没有 annotation_documents、segment_meta、translation_status_snapshots、mcp_tool_call_audits。tier_annotations 是另一张表，不是标注文档，也不是层定义。

## 下一条：另一项目的层

这一条已于 2026-10-24 接受，记在 ADR-0082。实现按下面的合同。

推荐：

1. 在 .jyd 的 layers 上加可空的 `text_id TEXT`，只改 CREATE。迁移的 INSERT 和 SELECT 不碰这列。旧文件不加列。
2. 只实现 listForeignOwnedLayers。返回 `{ id, textId }`。不读层定义的其余字段。
3. 要查的编号先去掉空白，空编号丢掉，再去重。一个都不剩就返回空列表，不打开文稿；仍须先检查是否已打开项目文件夹。
4. 找不到的编号跳过。找到的行如果 text_id 不是去掉空白后非空的字符串，抛 `layer row is incomplete`，不把这行算进结果，也不用 meta.id 或 project.id 补上。NULL、空字符串和纯空白字符串均拒绝。
5. 去掉空白后的 text_id 与传入的项目编号相同，就不是另一项目。查询用的项目编号不再去掉空白，和前置切片的语段查询合同一样。返回的 textId 使用去掉空白后的值。
6. 同一个层编号出现在两份文稿里，抛 `duplicate layer ${id} in project folder`，行留下。
7. 不打开文件夹时抛 `sqlite storage port has not opened a project folder`。
8. 旧结构没有 text_id 列时，非空查询整体拒绝，统一抛 `layer row is incomplete`；即使请求编号不存在，也不返回空结果。不补列，不跳过旧文件，不回退到其他归属字段。不得把已经收集的部分结果返回给调用方。空编号查询仍按第 3 条返回，不打开文稿。

这和前置切片已经落地的语段规则不同：语段上空的 text_id 不算另一项目。层上没有记项目编号时，协作检查不能把它当成「属于当前项目」。开关仍默认关，所以这条在被装上之前不改变现有协作路径。前置切片的测试已在本分支通过。

不选：

- 用 meta.id 当层的项目编号。那是文稿编号，不是 tier_definitions.textId。
- 用文件夹里 project.id 当每一层的项目编号。同一份文稿里的语段可以带着另一个 text_id。
- 把空的 text_id 当成另一项目。那样会编出一个并不存在的项目编号。
- 顺手实现 readTierDefinition 或 listTierIdsByContentLanguage。现有列没有内容类型和名称。

### 接受之后的文件

- 在 src/db/ 新建 sqliteForeignLayers.ts，少于 120 行。
- 在 src/db/ 新建 sqliteForeignLayers.test.ts。
- src/db/sqliteStoragePort.ts 展开 layerForeignMethods。文件仍少于 300 行。
- scripts/apply-legacy-plan.mjs 只改 layers 的 CREATE。
- 规格勾上这一条。「其余」仍不勾。

### 接受之后的验收

先写会失败的测试，再写实现。只用合成夹具，覆盖：

- 同一次查询包含当前项目层、另一项目层和缺失层，只返回另一项目层。
- 层编号去掉首尾空白、丢弃空编号并去重；重复输入只返回一行，不能误报跨文稿重复。
- `text_id = ' project-a '` 与项目参数 `'project-a'` 匹配，当前项目层不返回；参数 `' project-a '` 不去空白，此时返回 `{ id, textId: 'project-a' }`。
- 只含空编号时返回空列表，不打开文稿；用含错误 application_id 的顶层 .jyd 证明没有打开文件。
- 新结构中，命中行的 text_id 分别为 NULL、空字符串、纯空白字符串时，均抛 `layer row is incomplete`，关闭重开后行和值保持不变。
- 旧结构不含 text_id 列，非空查询抛 `layer row is incomplete`，包含查询不存在编号的情况；失败后关闭重开，`PRAGMA table_info(layers)` 及原行保持不变。
- 两份文稿里的同一个编号抛 `duplicate layer`，即使归属相同也拒绝；关闭重开确认两处行都留下。
- 隐藏目录及普通子目录中的 .jyd 不读。
- 顶层文稿错误的 application_id 抛 `${basename} application_id is not a Jieyu manuscript`。
- 没有文件夹时拒绝，空编号也不绕过文件夹检查。
- 关掉再打开，读到的仍是夹具写入的 text_id；此测试只证明查询读取了持久化值，不表示本切片实现层写入。

然后跑：

```sh
npx vitest run src/db/sqliteForeignLayers.test.ts
npm run test:project-files-scripts
npm run typecheck
```

test:project-files-scripts 必须仍然通过，因为迁移读回的层对象不含 textId。

## 继续拒绝，各自另作决定

这些不放进 ADR-0082。每一组缺的字段不一样，不能用层的 text_id 一起解决。

| 方法 | 调用方 | 缺口 | 现在的边界 |
| --- | --- | --- | --- |
| readProject | projectCharacterVariantStore、annotationAbbreviationStore、annotationPosCategoryStore | name 不是多语言标题，没有 createdAt 和 updatedAt | 不把 name 当成 title，不补时间 |
| readLayerUnit、listLayerUnitsAtMediaStart | aiWriteReadback、citationResolver | 没有 createdAt，转写不在语段行上 | 编号方法已经落地。不把 units 加 unit_contents 装成整份文档 |
| readTierDefinition、listTierIdsByContentLanguage | aiWriteReadback | 层行没有内容类型、名称和时间 | 不把 tier_annotations 当成层定义 |
| listUnitTokensByText、listUnitMorphemesByText | corpusAnalysis | form 是普通文本，没有项目编号列、注释和时间 | 词计数保持不变。不返回半份文档 |
| listNotesByTarget、putUserNote | linguisticServiceNoteOps | 行归属已由 ADR-0062 第 3 条定下；text 不是多语言正文，没有项目编号和时间 | 不写备注 |
| countAnnotationDocuments | annotationDocumentCollaborationGate | 没有 annotation_documents | 不数 tier_annotations |
| listSegmentMetaByText、listSegmentMetaForMediaLayers、listSegmentMetaForTextLayers | 首页进度、项目概览 | 没有 segment_meta。浏览器里的这张表是读模型 | 不从语段和正文现算一份读模型 |
| listTranslationSnapshotsByMedia、listTranslationSnapshotsByText | 首页进度、项目概览 | 没有这张表 | 不从层或正文现算翻译状态 |
| insertMcpToolCallAudit | mcpToolCallAudit | 没有这张表 | 不把工具调用审计塞进现有 audit_logs |

以后如果要做其中一组，沿用 ADR-0080 和 ADR-0081 的形状：可空列只加在新的 CREATE 上，迁移不读，旧库不加列，空的必填字段拒绝读取，不从审计或别的表补字段。那也是新的 ADR，不是本页的接受。

## 本规划不做

- 不勾选规格任务「其余」，不删除 docs/execution/specs/sqlite-storage-port/。
- 不改 Dexie 的写入和读取。
- 不改协作服务去调用 SQLite。那是 #280。
- 不打开文件选择器，不送系统垃圾箱。那是 #325。
- 不把 E2E 迁到 Electron。那是 #329。
- 不编文稿改挂录音的确认文案。
