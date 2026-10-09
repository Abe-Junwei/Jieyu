---
title: 项目数据第 5 批（多份标注文稿）验证记录
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-10-09
source_of_truth: tests/e2e/batch5MultiDocument.spec.ts
---

# 项目数据第 5 批（多份标注文稿）验证记录（2026-10-09）

对应方案：[项目、资料与持久化架构改进方案（修订五）](../plans/project-data-architecture-improvement-2026-10-08.md) 第 5 批中的“多文稿 UI”（D4、T46；4.1 / 4.2-8；7.2 清单 `documents[]`）。前置：2B-E 标注文档切片、[第 3 批 JYT / JYM / JYB](./project-data-batch3-jyb-verification-2026-10-09.md)。第 5 批的另两项（资料组、访问级别）推迟到数据冻结之后（见下文“推迟项”）。数据未冻结（`JIEYU_DATA_FROZEN=false`），本次没有改基线 schema（`tier_definitions.documentId` 在 2B-E 已有）。

## 语义

- **当前文稿 = 项目的默认文稿**（`texts.defaultDocumentId`，对应文稿行 `isDefault: true`）。切换文稿就是改默认文稿，按项目保存；工作台、导入、导出都跟随当前文稿。
- 层的归属：`tier_definitions.documentId`。没写 documentId 的层属于默认文稿；**默认文稿改变之前**，先把没写 documentId 的层（含桥接行）显式写成原默认文稿，所以切换不会让层“漂”到新文稿。
- 指向本机不存在的文稿的层（协作同步不带 `annotation_documents` 行、损坏的包）在工作台里归当前文稿显示，不会凭空消失。
- 归属只有一条规则（B5-4）：`resolveLayerOwner(layer, scope)`——层的 documentId 是本项目现有文稿就归它，否则归默认文稿。工作台过滤、删除预览的计数、删除时收集单元、项目包清单都用它，所以删除对话框里写的数目就是实际删掉的数目。

## 服务（`src/services/annotationDocumentService.ts`）

- `createAnnotationDocument(textId, title?)`：先确保原默认文稿存在，再新建空文稿并设为当前。只对从未协作的项目开放（D6，`canCreateAnnotationDocument`），否则抛 `AnnotationDocumentCollaboratedProjectError`。
- `renameAnnotationDocument`（只改 title；空名清除 title，界面显示“文稿 N”）、`switchAnnotationDocument`。
- `deleteAnnotationDocument`：同一个事务里删除该文稿的单元图（`deleteAnnotationDocumentUnitGraph`）、层、桥接行、`layer_links`（两个方向）、`tier_annotations` 和文稿行；删的是当前文稿时，最早建立的剩余文稿成为当前文稿。归属按删除前的状态判断（先算好要删的层和单元，再改默认文稿）。同一事务里还按被删层的 id 删掉 `layer_unit_contents`（连同译文备注）、`segment_meta` 和三种派生快照（`segment_quality_snapshots`、`scope_stats_snapshots`、`translation_status_snapshots`），即使它们挂在因属于别的文稿而保留的单元上（B5-1），不留指向已删层的孤儿行。**最后一份文稿不能删**（`AnnotationDocumentLastDocumentError`，整体回滚）。来源记录属于项目，保留。
- 删除前快照：删除之前先把整个项目（`exportProjectScopedDatabaseAsJson`）存进第 3 / 4b 批的覆盖前快照库 `jieyu_overwrite_snapshots`（`packageKind: 'document-delete'`，写入后读回校验，每个项目保留最近 3 份）。**快照失败就不删**（`AnnotationDocumentSnapshotFailedError`，什么都不改）。文稿不存在、只剩一份这两种必然失败的删除先检查，不留无用快照。快照在“导入 → 从快照恢复…”里显示为“删除标注文稿前”，恢复后被删的文稿、层、单元和当前文稿都回来。
- `runInNewAnnotationDocument`：“导入为新文稿”。导入中途抛错、或导入流程自己报告失败（`isFailed`，导入钩子把吞掉的错误记成 `saveState.kind === 'error'`）时，删掉新文稿连同写了一半的内容并切回原文稿（B5-3）；回滚本身出错只记日志，不掩盖原错误。成功但没写进任何内容的新文稿同样删掉；成功且有内容的保留。丢弃刚建的文稿不存删除前快照，不占用户的 3 个快照位。
- 崩溃恢复快照：新建、切换、删除文稿以及“导入为新文稿”之后清掉该项目的崩溃恢复快照（`clearRecoverySnapshot`，B5-2）。恢复快照不带文稿行，文稿变动后再应用旧快照会复活已删的层、让当前文稿指向已删的文稿。
- 协作反向门（`annotationDocumentCollaborationGate.ts`）：有多份文稿的项目不能开启协作、也不能上传——协作桥不启动、出站变更不入队，`registerProjectAsset` / `createProjectSnapshot` 抛 `AnnotationDocumentCollaborationBlockedError`。正向门照旧：协作过的项目不能新建文稿。
- 归属中间件 `JIEYU_PARENT_CONSISTENCY_RULES` 新增 `tier_definitions → annotation_documents`：层的 documentId 必须是同一项目的文稿（父行不存在时照旧跳过）。包导入（BF1-N3）与 JSON 导入（BF1N3-1）的 `dropOrphanRows`（`src/db/dropOrphanRows.ts`）用同一份规则，但层缺文稿时先去掉 documentId 再查孤儿（B5-5），不丢层。

## 工作台

- `useTranscriptionSnapshotLoader`：只装当前文稿的层、单元（`listUnitDocsForText` 跳过其他文稿的层上的单元）、译文和语段计数；默认转写层（`resolveDefaultTranscriptionLayerId`）和“删除最后一个转写层”的单元范围也只在当前文稿内。
- 撤销 / 重做：项目或当前文稿变化时清空历史（`resetHistoryOnScopeChange`），避免把旧范围的差异写回（`syncToDbCore` 会删除目标状态里没有的单元）。这也修掉了以前切换项目后撤销的同类隐患。
- 项目中心新增“标注文稿”分类：列出文稿（当前文稿打勾，按建立时间排序）、点选切换、新建文稿…、重命名当前文稿…、删除当前文稿（只有一份文稿时不可用）。协作过的项目显示“协作过的项目暂不能新建文稿”。
- 新建 / 重命名 / 删除用应用内对话框 `AnnotationDocumentDialog`（复用 `ModalPanel`、`FormField`、`PanelButton`，没有新依赖，中英文案），不再用浏览器 prompt / confirm。新建、重命名输入名称（回车确认，可留空）；删除对话框写明会删多少语段和层，并提示删除前会存快照、可从快照恢复。操作失败时对话框保持打开并提示错误。
- 文稿菜单里当前文稿的菜单项带 `aria-current="true"`（`ContextMenu` 对选中的单选 / 勾选项统一加，勾号本身是 `aria-hidden`），读屏能读出哪份是当前文稿。
- 文稿操作的错误提示换成中英文案（项目不存在、文稿不存在、最后一份、删除前快照失败、协作过的项目），不显示内部 id 和英文原文；未知错误给通用提示，原文进日志。
- 导入标注对话框新增“导入为新文稿（不替换当前文稿）”；勾选时不显示替换预览。默认仍是替换当前文稿（再次导入覆盖哪份，先切到那份）。导入目标在时间轴不一致确认、EAF 层角色确认之后的重试里保留。

## 工作台之外的读取

都按当前文稿过滤（`readOtherDocumentLayerIds`：属于其他文稿的层 id；只有一份文稿时为空，结果不变）：

- `getTranslationLayers(layerType?, textId)` / `LinguisticService.layers.listByTextId` 与 `units.listByTextId`：标注页（`annotationWorkspaceController.data`、`ensureAnnotationLiteralLayer`、`writeAnnotationFormsToSurface`、`saveAnnotationUnit*`）、工作台文件面板、语料索引都只看当前文稿；新建的层因此只参考当前文稿里的宿主与同类层。
- 项目级统计：`WorkspaceReadModelService.rebuildForText`（层、单元、译文、语段元数据快照）与首页项目进度（`loadHomeProjectProgressBundle`）。项目有多份文稿时，首页文件面板写明“统计范围：当前文稿「…」（本项目有多份文稿）”（编号与文稿菜单一致）。
- AI：嵌入失效判断用的默认转写层（`EmbeddingInvalidationService`）只在当前文稿内找。读 `segment_meta` 的对话工具（`search_units`，以及经 `loadScopedSegmentMetaRows` 的项目统计、备注、语言记忆）只留当前文稿的行（`keepCurrentDocumentRows`），结果的 `_readModel.documentScope` 为 `'current_document'`。按语段写文本的工具（`set_transcription_text`、`set_translation_text`、`clear_translation_segment`）写完读库核对，语段不在当前文稿的工作台里（保存静默跳过）时返回“没有写入”，不报完成。
- 例外：词库的出现位置引用（`loadOccurrenceCitationDisplays`）传 `allDocuments: true`，因为引用可能来自任一文稿。项目包 JYT / JYM / JYB 走 `projectScopedSnapshot` / 项目包服务，不经过这些读取，仍包含所有文稿。

## 导入导出

- EAF / TextGrid / TRS / FLEx / Toolbox / 轻量导出：导出的是工作台里的当前文稿（它们读工作台状态）。
- JYT / JYM / JYB：清单 `projects[].documents[]` 早已按文稿列出层与来源；ID 重映射覆盖 documentId。本次补测试确认两份文稿往返无损：恢复为新项目时文稿获得新 UUID、层跟随、当前文稿保持；JYT 覆盖当前项目、JYB 逐项目导入与整库还原都恢复两份文稿。

## 已知限制（未在本次处理）

- 协作（保留，用户决定 2026-10-09）：同步不带文稿行，所以只有从未协作的项目能新建额外文稿，有多份文稿的项目也不能开启协作或上传（反向门）。shortcut：反向门用内存缓存，在协作桥启动和文稿新建 / 删除后刷新；用 JYT / JYB 覆盖导入把多份文稿带进一个正在同步的项目时，要到下次协作桥启动（切换项目或重新打开）才拦住出站写入。
- 包或 JSON 里层的 documentId 指向包里和本机都没有的文稿时，导入只去掉 documentId，层归项目的默认 / 当前文稿（B5-5，`detachMissingDocumentRefs`；`tier_definitions` 与 `layers` 别名一样处理，跳过报告里不再列出实际写入了的层）。
- 跨文稿的父子单元（评审 R5-2：d1 的子单元指向 d2 的单元）：删掉 d2 时 d2 的那个单元因被引用而保留，它的层和层上的行已删（B5-1），单元本身留作无层单元。
- AI `search_units` 的 `limit` 在按文稿过滤之前生效，多文稿项目里可能少返回几条（shortcut）。归属判断读库失败时 AI 读取原样返回，不让工具整体失败。
- 删除文稿不能撤销（撤销历史在文稿变化时清空）；找回靠删除前快照，每个项目只保留最近 3 份（与覆盖前快照共用）。
- 没有层的宿主单元归属不明，多文稿下的替换与删除都保留它们。

## 推迟项

- 资料组（MaterialGroup）与访问级别：推迟到数据冻结之后（用户决定 2026-10-09），届时走迁移框架；方案 §10.0 第 5 行同步注明。本批没有为它们改 schema。

## 自动化验证

| 项                | 命令                                                                                                                                                 | 结果       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 服务与中间件      | `npx vitest run src/services/annotationDocumentMultiDocument.test.ts src/services/annotationDocumentService.test.ts`                                 | 通过       |
| 删除前快照        | `npx vitest run src/services/annotationDocumentDeleteSnapshot.test.ts`                                                                               | 3 用例通过 |
| 工作台之外的读取  | `npx vitest run src/services/annotationDocumentCurrentScopeReads.test.ts`                                                                            | 6 用例通过 |
| 协作反向门        | `npx vitest run src/services/annotationDocumentCollaborationGate.test.ts src/hooks/transcription/useTranscriptionCollaborationBridge.test.tsx`       | 通过       |
| AI 工具           | `npx vitest run src/hooks/ai src/ai/chat`                                                                                                            | 通过       |
| 菜单无障碍 / 错误 | `npx vitest run src/components/ContextMenu.test.tsx src/components/transcription/useAnnotationDocumentMenu.errors.test.ts`                           | 通过       |
| 工作台范围 / 撤销 | `npx vitest run src/hooks/transcription/useTranscriptionSnapshotLoader.documentScope.test.tsx src/hooks/transcription/useTranscriptionUndo.test.tsx` | 通过       |
| 项目中心 / 导入   | `npx vitest run src/components/transcription/LeftRailProjectHub src/hooks/importExport/useImportExport.import.test.tsx`                              | 通过       |
| 包往返            | `npx vitest run src/services/projectPackageMultiDocument.test.ts`                                                                                    | 4 用例通过 |
| e2e（T46）        | `npx playwright test --project=chromium tests/e2e/batch5MultiDocument.spec.ts tests/e2e/batch2bAnnotationDocuments.spec.ts`                          | 3/3 通过   |

全量（Node 22，提交 `567a4cc1`：第 5 批后续修复、合并 `origin/main`（`53fa8295`，post-freeze cleanup）与 B5-5 之后，新克隆 `npm ci` 后同一次运行，2026-10-09 23:59–2026-10-10 00:04）：`npm run test:vitest:dot` 907 文件通过、2 跳过，6456 用例通过、58 跳过；`npm run build` 通过（dist 里没有 .ts 文件）；对新启动的 `vite preview`（空闲端口）`npx playwright test --project=chromium --retries=0` 85 通过、2 跳过。

测试编号对应：T46 `batch5MultiDocument.spec.ts`（两份 EAF 用“导入为新文稿”并存于原文稿旁，删除其中一份不影响其他，再从“删除标注文稿前”快照恢复出被删的那份；新建、导入到当前文稿、切换后工作台只显示当前文稿的层、JYT 往返恢复两份文稿与当前文稿、删除当前文稿后切到剩下的一份并留下 `document-delete` 快照；新建 / 重命名 / 删除都走应用内对话框，不弹浏览器对话框）+ `useImportExport.import.test.tsx`（batch 5 两条）+ `annotationDocumentMultiDocument.test.ts`；工作台范围 `useTranscriptionSnapshotLoader.documentScope.test.tsx`；包往返 `projectPackageMultiDocument.test.ts`。
