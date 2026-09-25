---
title: annotation-retokenize-force design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-25
source_of_truth: annotation-retokenize-force-spec
depends_on:
  - ./requirements.md
  - ../annotation-retokenize/design.md
---

# Design — Annotation Retokenize Force (B4g)

## 1. 成熟方案扫描 / Research

- 仓库既有：B4f `applyAnnotationRetokenize` 在有 POS/gloss/词素/链接或脏草稿时只 `submitAnalysisGraphCandidate`。`removeToken` 会级联删掉该 token 的词素和链接。分析图 fixture 的 `features` 已是开放记录，pending candidate 会在下一次 submit 时被标成 rejected。
- 同类产品：FLEx 不静默改已确认 wordform。ELAN 的 tokenize 落在独立层，不直接抹掉依赖层。
- 业内：ADR-0022 写明自动分词只能先出 `alternativeAnalysis`；覆盖人工必须是审核或强制模式，并留下快照与回滚点。
- 公认不可行：默认按钮直接 `removeToken`；为快照新开 Dexie 表；把回滚只放在 React state 里，刷新就丢。
- 潜在的坑：强制提交会拒绝同句段上一条 pending candidate。未保存草稿若也走 submit，会把已有快照标掉。
- 决定：**复用** pending `analysis_graph_candidate`。强制时把原 token / 词素 / 链接放进 word 节点 `features.retokenizeSnapshot`，relation role 为 `retokenize-snapshot`，然后再替换词列。恢复按原 id 写回并 reject 该快照。脏草稿的 force 直接返回，不 submit。无新 flag。

## 2. 架构选择

- 落位：既有 retokenize helper + controller
- 拒绝：新 controller；新 Dexie 版本；静默覆盖

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `annotationRetokenize.ts` | 快照、覆盖、恢复 |
| `useAnnotationRetokenizeController.ts` | 覆盖 / 恢复状态 |
| `AnnotationIgtUnitExtras.tsx` | 两个按钮 |

## 4. ADR 引用

- ADR-0022：强制模式 + 快照回滚点
- 新建 ADR：否

## 5. Feature flag

- 沿用 `annotationPageEnabled`
- 无新 flag

## 6. 失败模式 / 兼容性

- 无快照时恢复不写库。
- 脏草稿时覆盖不写库。
- 下一次普通 candidate submit 会拒绝仍 pending 的快照。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 持久化 | `annotationRetokenize.test.ts` | pass |
| typecheck | `npm run typecheck` | 0 errors |
