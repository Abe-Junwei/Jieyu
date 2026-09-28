---
title: lexicon DMLex baseline design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-dmlex-baseline-spec
depends_on:
  - ./requirements.md
---

# Design — lexicon-dmlex-baseline

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`src/pages/lexicon/saveLexiconEntry.ts` 把编辑草稿收成一行再经 `LinguisticService.lexemes.save` 做写后读回。标注侧继续用 `MultiLangString` 只是读投影。
- 同类产品 / 标杆实现：OASIS DMLex 1.0 的编辑对象是 lexicographic resource 与 entry。FLEx/WeSay 的编辑对象是 LIFT entry。本产品的接收方不是 FLEx、WeSay、Lexique Pro 或 Dictionary App Builder。
- 业内 best practice / 事实标准 / 规范：以 `docs/architecture/dmlex/dmlex.schema.json` 为准。JSON 里 `partsOfSpeech`、`labels`、`translationLanguages` 是字符串。`additionalProperties` 为 false。词类在 entry 上，sense 不嵌套，顺序即数组顺序。
- 公认不可行 / 反模式 / 已弃用方案：在 DMLex 对象里再留一套 LIFT 字段。那会让大多数内容活在残留层，导出也不再是 DMLex。
- 潜在的坑：单独校验 entry 时，对译、解释、例句译文的 `langCode` 必填。资源行若把全部 entry 嵌进一个文档，列表和搜索都会扫整库。`ajv` 只作开发依赖，用来跑 fixture，不进运行时。
- 决定：**适配**官方 JSON，而不是自研一套近似模型。语料例句指针、自由文本注释、标注 `senseId` 放在 `jieyu` 或链接行，校验前剥掉。

## 2. 架构选择

- 落位类别：`state` 为 `entry` + `jieyu`；`actions` 为保存、LIFT 投影；`derived` 为列表标签、自动标注 gloss。
- 关键 trade-off：资源对象单独一行 `dmlex-resource`，不升 Dexie 版本。列表查询滤掉 `kind: 'resource'`。
- 拒绝的方案：新表、feature flag、把 lemma/senses 留作兼容别名。

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/utils/dmlexEntry.ts` | 草稿与 DMLex 对象互转，关系写在资源行 | 纯函数 |
| `src/pages/useLexiconEntryEditController.ts` | 表单状态与保存 | < 300 行，1 个 effect |
| `src/services/linguisticServiceLexemeOps.ts` | 列表滤掉资源行，按词头排序 | 现有文件 |

约束自查：
- [x] 单 hook 行数 < 300，`useEffect/useMemo/useCallback` 总数 < 12
- [x] 编排层只组装 / 透传 / 绑事件
- [x] 不引入 `src/features/…`
- [x] 面板 CSS 沿用现有两层，不新增边框

## 4. ADR 引用

- 相关 ADR：[0035](../../../adr/0035-lexicon-edit-baseline-dmlex.md)
- 是否需要新建 ADR：否，决策已在 0035。

## 5. Feature flag

不启用。没有旧数据需要分叉。

## 6. 失败模式 / 兼容性

- 旧用户路径：无历史词条。旧 LIFT 形状不再通过校验。
- 数据迁移：不升 Dexie 版本。
- 回滚预案：回退本分支。LIFT 文件仍可再导入。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/utils/dmlexEntry.test.ts src/utils/lexiconLiftImport.test.ts src/pages/LexiconPage.test.tsx` | all pass |
| 结构守卫 | `npm run check:architecture-guard` | OK |
| E2E | `npm run test:e2e:chromium` | green |
