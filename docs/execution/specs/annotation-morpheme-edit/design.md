---
title: annotation-morpheme-edit design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-04
source_of_truth: annotation-morpheme-edit-spec
depends_on:
  - ./requirements.md
  - ../annotation-token-edit/design.md
  - ../../plans/标注页与词典页开发路线图-2026-04-25.md
---

# Design — Annotation Morpheme Edit (B4b)

## 1. 成熟方案扫描 / Research

- 仓库既有：`LinguisticService.units.saveMorpheme` / `listMorphemesByTokenIds` / `saveToken` / `removeToken` / `saveTokenLexemeLink`；B4a-2 `saveAnnotationIgtRowTokens` 写→readback；`LeipzigValidator` 已接受 `customAbbreviations`；语言资产 `/assets/structural-profiles` 已有模板新建/启停/导入导出/sandbox（`LinguisticStructuralProfileService` + `DEFAULT_LEIPZIG_STRUCTURAL_PROFILE`）。无 token 切分/合并专用 API。
- 同类产品：FLEx Interlinear 手动把 wordform 切成 morpheme，再 `WfiMorphBundle` 链到 lexicon；Plaid Analyze 用受控 IGT 格子。ELAN Symbolic Subdivision 适合词/词素层，但不做词典链接。
- 业内：Leipzig Glossing Rules（MPI / Universität Leipzig 2008）用 `-` 词素边界、`.` feature、`=` clitic；校验应非阻塞。Web IGT 用 CSS grid 对齐，不用 ContentEditable。
- 公认不可行：自建第二套 Validator 后台；把词素 gloss 写入 `layer_units`；调用会写库的 `AutoGlossService.glossUnit` 做 preview；把形态逻辑塞进已满 12 hook 的 workspace controller；挂 ChatWindow。
- 潜在的坑：`removeToken` 级联删除；gloss lang 须与 B4a-2 一样优先 `default`；切分后 tokenIndex 必须重排；Leipzig 小写词项应跳过、只标大写未知缩写。
- 决定：**复用** LinguisticService token/morpheme/link API + 既有结构标注配置页作 Validator 模板；**适配** LeipzigValidator 用系统 profile 的 zero/redup 标记作自定义缩写；**自研** 最小切分/合并纯函数与 `replaceMorphemesForToken`（现有 API 只能 insert，不能按 token 替换）。不新增依赖。

## 2. 架构选择

- 落位：`actions`（写库）+ `state`（词素/链接草稿）+ `derived`（Leipzig 警告）
- 选 A：独立 `useAnnotationMorphologyController` + helper；workspace 只暴露 `reload`
- 拒绝：在 workspace controller 再加 hook；新建 Validator 资产表

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `linguisticServiceUnitTokenOps.replaceMorphemesForToken` | 删旧插新 + 可供 readback | < 40 |
| `annotationMorphemeDrafts.ts` / `splitMergeAnnotationTokens.ts` / `saveAnnotationLexemeLink.ts` / `annotationLeipzigGloss.ts` | 纯函数与写+readback | 各 < 120 |
| `useAnnotationMorphologyController.ts` | 词素/切分/链接接线 | < 260 / ≤ 12 hooks |
| `AnnotationIgtRow.tsx` + CSS | 词素格、切分、链接；无第 3 层容器 border | 增量 |

约束自查：无 ChatWindow；无 `src/features/`；原生 input 边框不计入容器层。

## 4. ADR 引用

- ADR-0020 读范围不变；词素/链接写仍走 `unit_morphemes` / `token_lexeme_links`
- 新建 ADR：否

## 5. Feature flag

- 沿用 `annotationPageEnabled`，默认 `false`

## 6. 失败模式 / 兼容性

- 无法切分（无空格/`|`）或无法分词素（无 `-`/`=`）：错误提示，不写库
- 链接查询无命中：错误提示
- 回滚：关 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 持久化 | Dexie vitest：morpheme / split-merge / lexeme link readback | pass |
| 守卫 | architecture-guard / docs / workflow | OK |
