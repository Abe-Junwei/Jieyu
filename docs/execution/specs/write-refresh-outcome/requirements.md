---
title: write-refresh-outcome requirements
doc_type: execution-spec-requirements
status: active
owner: import
last_reviewed: 2026-10-15
source_of_truth: write-refresh-outcome-spec
---

# Requirements — 写入与写后刷新分开报告

## 1. What & Why

- **要做什么**：项目包导入和标注导入在写入成功、界面刷新失败时，报告「已写入但界面待刷新」，重试只重新读取。
- **为什么现在做**：同一个 `try/catch` 会把刷新失败说成导入失败。用户再导入一次，恢复为新项目会再写一份；新建文稿路径还会把已经写好的文稿删掉。
- **不做什么**：不改协作、Supabase、智能体路径；不用全库正则禁止 `try/catch`；媒体删除和恢复路径仍留在下一批。

## 2. 用户场景（≤ 3 条）

1. 项目包已经写入，刷新快照失败。提示不是「导入失败」。再点刷新只调用 `loadSnapshot`，不再调用恢复。
2. 标注已经写入，刷新失败。数据库里仍能读回语段。再刷新不重新解析文件。新建文稿仍留下。
3. 标注事务已提交，但约束整理写入失败。提示是「后续整理没有完成」，重试不重新导入，也不再调用整理写入。

## 3. 验收标准（可测）

- [ ] 归档导入：写入成功 + `loadSnapshot` 拒绝 → `written-refresh-pending`，重试后恢复函数仍只调用 1 次
- [ ] 标注导入：同上，且 `layer_unit_contents` 读回导入文本；`setSaveState` 不是 `kind: 'error'`
- [ ] 新建文稿：刷新失败后文稿和内容仍在
- [ ] 事务提交后的整理写入失败 → `written-follow-up-unconfirmed`，重试不增加解析次数和整理写入次数
- [ ] 写入本身抛错 → `write-unconfirmed`，不调用 `loadSnapshot`
- [ ] 标注共用写入：写入成功且 reload 拒绝 → 提示不是 `error`，gloss 可读回；重试不再调用写入
- [ ] 整理失败的 `SaveState` 是 `follow-up-pending`；刷新成功后也不是 `done`

## 4. 受影响代码地图

| 类别   | 文件                                                                              | 改动性质                         |
| ------ | --------------------------------------------------------------------------------- | -------------------------------- |
| Helper | `src/hooks/importExport/persistedRefresh.ts`                                      | 新增结果类型                     |
| Hook   | `useImportExport.archiveHandlers.ts` / `importHandlers.ts` / `useImportExport.ts` | 分开刷新                         |
| UI     | `LeftRailProjectHub.tsx` / `ToastContext.tsx`                                     | 按结果关对话框、警告提示         |
| i18n   | `dictKeys.ts`、`dictionaries/*`                                                   | 两条提示                         |
| 守卫   | `scripts/architecture-guard/rules.patterns.postCss.mjs`                           | 禁止这两处 `await loadSnapshot(` |
| 测试   | `persistedRefresh.test.ts`、归档与标注导入测试                                    | 故障注入                         |

## 5. 已知风险与依赖

- 标注导入在事务前可能已经 `matchOrCreate` 词条。事务抛错时结果是「未确认」，不能当成整段回滚。
- 整理失败和刷新失败是两种结果。重试都只读，这一批不自动重做整理写入。
