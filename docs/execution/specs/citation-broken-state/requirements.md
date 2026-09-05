---
title: citation-broken-state requirements
doc_type: execution-spec-requirements
status: active
owner: corpus
last_reviewed: 2026-09-05
source_of_truth: citation-broken-state-spec
---

# Requirements — Citation Broken State (B6)

## 1. What & Why

- **要做什么**：语料 unit 删除后，引用解析进入可诊断断裂态（稳定错误码 + i18n），跳转不得假装目标仍在；失效 RAG 摘要不得再当成功摘录。
- **为什么现在做**：B5a-2 已合入；P0-6 / ADR-0011 剩余是删除后的 UI 消费。unit 引用目前无存在性检查。
- **不做什么**：不实现 `jieyu:corpus:v1` 写作 URI；不新建 `deletedAt` 软删列；不接线 B2 跨页事件（合同仍零生产消费方）；不开放写作页；不接 ChatWindow 新分区。

## 2. 用户场景（≤ 3 条）

1. 用户删除一句段后，AI 脚注再点该 unit：侧栏错误，不跳转时间轴。
2. 复制含索引未命中引用的助手回复：来源行只有诊断标记，不含旧 snippet。
3. 标注 IGT 上 `token_lexeme_links` 指向已不存在的 lexeme：显示断裂文案，不用 id 冒充 lemma。

## 3. 验收标准（可测）

- [ ] `removeUnit` 后 `resolveUnitCitation` 返回 `CITATION_UNIT_NOT_FOUND`；残留 segment 行不能把已删 unit 判为 OK
- [ ] `handleTranscriptionCitationJump` 对缺失 unit 调 `onSetSidebarError`，不调 `onJumpToEmbeddingMatch`
- [ ] `readModelIndexHit === false` 的 footer **不含** snippet
- [ ] 悬空 lexeme 链接 `brokenCode === CITATION_LEXEME_NOT_FOUND`
- [ ] 不改 `annotationPageEnabled` / `corpusLibraryPageEnabled` 默认值

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Service | `src/services/citationResolver.ts` | 新增 |
| 页面编排 | `TranscriptionPage.citationJump.ts` | 消费 resolver |
| Helper | `citationFootnoteUtils.ts`、`saveAnnotationLexemeLink.ts` | 禁止假成功摘要 |
| UI | `AnnotationIgtRow.tsx` | 断裂态文案 |
| i18n | `dictKeys` / dictionaries | 新键 |
| ADR / 路线图 | ADR-0011、主路线图、代码地图 | 错误码回写 |

## 5. 已知风险与依赖

- `segment_meta` 仍是 best-effort：resolver 只信 canonical `layer_units`，忽略残留 segment。
- 软删字段不在本切片 schema。硬删是当前唯一删除语义。
