---
title: 项目数据第 5 批（多份标注文稿）验证记录
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-10-09
source_of_truth: tests/e2e/batch5MultiDocument.spec.ts
---

# 项目数据第 5 批（多份标注文稿）验证记录（2026-10-09）

对应方案：[项目、资料与持久化架构改进方案（修订五）](../plans/project-data-architecture-improvement-2026-10-08.md) 第 5 批中的“多文稿 UI”（D4、T46；4.1 / 4.2-8；7.2 清单 `documents[]`）。前置：2B-E 标注文档切片、[第 3 批 JYT / JYM / JYB](./project-data-batch3-jyb-verification-2026-10-09.md)。第 5 批的另两项（资料组、访问级别）不在本次范围内。数据未冻结（`JIEYU_DATA_FROZEN=false`），本次没有改基线 schema（`tier_definitions.documentId` 在 2B-E 已有）。

## 语义

- **当前文稿 = 项目的默认文稿**（`texts.defaultDocumentId`，对应文稿行 `isDefault: true`）。切换文稿就是改默认文稿，按项目保存；工作台、导入、导出都跟随当前文稿。
- 层的归属：`tier_definitions.documentId`。没写 documentId 的层属于默认文稿；**默认文稿改变之前**，先把没写 documentId 的层（含桥接行）显式写成原默认文稿，所以切换不会让层“漂”到新文稿。
- 指向本机不存在的文稿的层（协作同步不带 `annotation_documents` 行、损坏的包）在工作台里归当前文稿显示，不会凭空消失。

## 服务（`src/services/annotationDocumentService.ts`）

- `createAnnotationDocument(textId, title?)`：先确保原默认文稿存在，再新建空文稿并设为当前。只对从未协作的项目开放（D6，`canCreateAnnotationDocument`），否则抛 `AnnotationDocumentCollaboratedProjectError`。
- `renameAnnotationDocument`（只改 title；空名清除 title，界面显示“文稿 N”）、`switchAnnotationDocument`。
- `deleteAnnotationDocument`：同一个事务里删除该文稿的单元图（`deleteAnnotationDocumentUnitGraph`）、层、桥接行、`layer_links`（两个方向）、`tier_annotations` 和文稿行；删的是当前文稿时，最早建立的剩余文稿成为当前文稿。**最后一份文稿不能删**（`AnnotationDocumentLastDocumentError`，整体回滚）。来源记录属于项目，保留。
- `runInNewAnnotationDocument`：“导入为新文稿”。导入结束后新文稿若仍为空（导入失败或没写进任何内容），删掉它并切回原文稿；已有内容的新文稿保留，不删导入的数据。
- 归属中间件 `JIEYU_PARENT_CONSISTENCY_RULES` 新增 `tier_definitions → annotation_documents`：层的 documentId 必须是同一项目的文稿（父行不存在时照旧跳过）。包导入的 BF1-N3 `dropOrphanRows` 用同一份规则。

## 工作台

- `useTranscriptionSnapshotLoader`：只装当前文稿的层、单元（`listUnitDocsForText` 跳过其他文稿的层上的单元）、译文和语段计数；默认转写层（`resolveDefaultTranscriptionLayerId`）和“删除最后一个转写层”的单元范围也只在当前文稿内。
- 撤销 / 重做：项目或当前文稿变化时清空历史（`resetHistoryOnScopeChange`），避免把旧范围的差异写回（`syncToDbCore` 会删除目标状态里没有的单元）。这也修掉了以前切换项目后撤销的同类隐患。
- 项目中心新增“标注文稿”分类：列出文稿（当前文稿打勾，按建立时间排序）、点选切换、新建文稿…、重命名当前文稿…、删除当前文稿（确认框写明会删多少语段和层；只有一份文稿时不可用）。协作过的项目显示“协作过的项目暂不能新建文稿”。`shortcut:` 名称输入与删除确认用浏览器自带的 prompt / confirm。
- 导入标注对话框新增“导入为新文稿（不替换当前文稿）”；勾选时不显示替换预览。默认仍是替换当前文稿（再次导入覆盖哪份，先切到那份）。导入目标在时间轴不一致确认、EAF 层角色确认之后的重试里保留。

## 导入导出

- EAF / TextGrid / TRS / FLEx / Toolbox / 轻量导出：导出的是工作台里的当前文稿（它们读工作台状态）。
- JYT / JYM / JYB：清单 `projects[].documents[]` 早已按文稿列出层与来源；ID 重映射覆盖 documentId。本次补测试确认两份文稿往返无损：恢复为新项目时文稿获得新 UUID、层跟随、当前文稿保持；JYT 覆盖当前项目、JYB 逐项目导入与整库还原都恢复两份文稿。

## 已知限制（未在本次处理）

- 协作：同步不带文稿行，所以只对从未协作的项目开放新建文稿；一个已有多份文稿的项目之后开启协作，远端会把所有层并在当前文稿里显示。
- 工作台之外的读取方（如 `getTranslationLayers`、AI 工具、项目级统计）仍按项目读取全部文稿的层。
- 包里层的 documentId 指向包中不存在的文稿时，`dropOrphanRows` 会丢掉这些层，但它们的单元还在（单元的父规则是项目）。
- 删除文稿没有覆盖前快照，只有确认框；不能撤销。
- 没有层的宿主单元归属不明，多文稿下的替换与删除都保留它们。

## 自动化验证

| 项                | 命令                                                                                                                                                 | 结果       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 服务与中间件      | `npx vitest run src/services/annotationDocumentMultiDocument.test.ts src/services/annotationDocumentService.test.ts`                                 | 通过       |
| 工作台范围 / 撤销 | `npx vitest run src/hooks/transcription/useTranscriptionSnapshotLoader.documentScope.test.tsx src/hooks/transcription/useTranscriptionUndo.test.tsx` | 通过       |
| 项目中心 / 导入   | `npx vitest run src/components/transcription/LeftRailProjectHub src/hooks/importExport/useImportExport.import.test.tsx`                              | 通过       |
| 包往返            | `npx vitest run src/services/projectPackageMultiDocument.test.ts`                                                                                    | 4 用例通过 |
| e2e（T46）        | `npx playwright test --project=chromium tests/e2e/batch5MultiDocument.spec.ts tests/e2e/batch2bAnnotationDocuments.spec.ts`                          | 3/3 通过   |

全量（Node 22，提交 `dc29b11e`，新目录 `npm ci` 后同一次运行，2026-10-09 21:10）：`npm run test:vitest:dot` 902 文件通过、2 跳过，6421 用例通过、58 跳过；`npm run build` 通过（dist 里没有 .ts 文件）；对新启动的 `vite preview`（空闲端口）`npx playwright test --project=chromium --retries=0` 79 通过、2 跳过。前一次全量 vitest 有 1 个与本批无关的超时（`tests/golden/goldenRoundTrip.test.ts` 第一条用例在高负载下超过 5 秒；单独运行 24/24 通过），上面记录的是随后完整重跑的结果。

测试编号对应：T46 `batch5MultiDocument.spec.ts`（两份 EAF 用“导入为新文稿”并存于原文稿旁，删除其中一份不影响其他；新建、导入到当前文稿、切换后工作台只显示当前文稿的层、JYT 往返恢复两份文稿与当前文稿、删除当前文稿后切到剩下的一份）+ `useImportExport.import.test.tsx`（batch 5 两条）+ `annotationDocumentMultiDocument.test.ts`；工作台范围 `useTranscriptionSnapshotLoader.documentScope.test.tsx`；包往返 `projectPackageMultiDocument.test.ts`。
