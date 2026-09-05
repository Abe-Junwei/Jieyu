---
title: citation-broken-state design
doc_type: execution-spec-design
status: active
owner: corpus
last_reviewed: 2026-09-05
source_of_truth: citation-broken-state-spec
depends_on:
  - ./requirements.md
---

# Design — Citation Broken State (B6)

## 1. 成熟方案扫描 / Research（承接工作流 §5.1.5）

- 仓库既有：`TranscriptionPage.citationJump.ts` 已对 note/schema/pdf 缺失报错，但 **unit 无存在性检查**；RAG `readModelIndexHit` 只标「当前时间线未命中」仍附带 snippet；标注 `lemmaById.get(...) ?? link.lexemeId` 用 id 冒充 lemma。`WORKSPACE_LEXEME_DELETED_EVENT` **未**落在 `appShellEvents.ts`（B2 合同仅文档）。
- 同类产品：Zotero 把失效引用标成 orphaned field，禁止当仍可刷新的书目项；CSL/citeproc 对缺条目出 `citation-not-found` 而非沿用缓存正文；ELAN/FLEx 对已删 annotation/lexeme 给缺失标记，不把旧文本当 live。
- 业内：解析结果三分 OK / 可诊断断裂 / 权限不足；稳定错误码（类 RFC 9457）；展示层可保留快照，真值以 resolver 为准。
- 公认不可行：静默 200 + 缓存摘录；把 id 当显示名；为 UI 另建第二套引用真源表；本切片上 Dexie `deletedAt`（无 GC/协同评估）。
- 潜在的坑：`segment_meta` 延迟会留下 segment 行；写作 `jieyu:corpus:v1` 未开放，Core 先服务转写/标注，避免过早 `src/writing/`。
- 决定：**复用** 现有 note/schema/pdf 缺失路径与 `readModelIndexHit`；**适配** 为 unit 存在性检查 + footer 省略 snippet；**自研** 最小 `citationResolver`（错误码表）。不接线 B2 事件。

## 2. 架构选择

- 落位：`derived`（解析）+ `actions`（跳转拦截）+ 薄 UI 文案。
- 方案 A：独立 resolver service，jump/footer/IGT 消费。选 A：可单测、页面不堆查找。
- 拒绝：在 Orchestrator 里加 effect 监听删除事件（B2 未落地）；写作 URI 解析器（G0 写作轨）。

## 3. 落位清单（与 requirements §4 对应）

| 文件 | 职责（一句话） | 复杂度估计（行 / hooks） |
| --- | --- | --- |
| `src/services/citationResolver.ts` | unit 存在性 + 错误码 + lexeme 展示投影 | < 80 / 0 |
| `TranscriptionPage.citationJump.ts` | 缺失 unit 不跳转 | 薄改 |
| `citationFootnoteUtils.ts` | 索引未命中省略 snippet | 薄改 |
| `saveAnnotationLexemeLink.ts` | 悬空链接 brokenCode | 薄改 |

约束自查：
- [x] 无新 hook
- [x] 编排层只消费 resolver
- [x] 不引入 `src/features/…`
- [x] 无新面板边框

## 4. ADR 引用

- [`docs/adr/0011-writing-corpus-ref-and-citation-jump.md`](../../../adr/0011-writing-corpus-ref-and-citation-jump.md)：回写错误码表与 Core 过渡路径 `src/services/citationResolver.ts`。
- 不新建 ADR。

## 5. Feature flag（如启用）

- 不新增。行为是修正假成功，沿用现有页面 flag。

## 6. 失败模式 / 兼容性

- 旧聊天里的 snippet 仍存在于消息行；复制来源列表在 index miss 时不再复述。
- 无 schema 迁移。
- 回滚：还原 resolver 接线；跳转恢复盲跳。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/services/citationResolver.test.ts src/pages/TranscriptionPage.citationJump.test.ts src/utils/citationFootnoteUtils.test.ts src/pages/annotation/saveAnnotationLexemeLink.test.ts` | pass |
| 结构守卫 | `npm run check:architecture-guard` | OK |
| E2E | N/A（无新路由；jump 用 vitest） | — |
| Agent evals | N/A（不改 `src/ai/**` 行为合同） | — |
