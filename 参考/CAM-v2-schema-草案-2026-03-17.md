# 解语 CAM v2 Schema 草案

日期：2026-03-17

状态：Draft

实施进展（2026-03-17）：
- Phase A（provenance 语义收敛）已完成首轮落地
- Phase B（word/morpheme 稳定 identity）已完成首轮落地
- 当前处于“文档草案 + 代码已实现 + 迁移后验证通过”的状态

适用范围：
- 解语内部 Canonical Annotation Model 下一阶段演进
- 后续 Dexie migration 设计
- F12 auto-gloss、F19 搜索、F28 embeddings、F31/F32 AI/RAG、协同编辑 PoC 的数据底座

---

## 1. 草案目标

本草案不追求“一次性重构全部表”，而是回答三个问题：

1. 哪些对象应当是唯一真值来源
2. 哪些对象必须有稳定 identity，不能再依赖数组 index
3. 哪些系统级对象必须进入 schema，而不能继续停留在运行时临时对象

CAM v2 的设计目标：

- 保持当前 EAF / TextGrid / FLEx / Toolbox / Transcriber 五格式互操作能力
- 收敛 source of truth，减少双写漂移
- 为 token / morpheme / note / AI suggestion 建立稳定引用锚点
- 统一 provenance / review / confidence 语义
- 让 AI 任务、embeddings、RAG 检索成为一等 schema 公民
- 为 Yjs / CRDT 对象级协同编辑保留演进空间

非目标：

- 本阶段不强行移除所有旧字段
- 本阶段不实现 F30 正字法投射引擎
- 本阶段不要求所有 tier 编辑都完全物化为 token/morpheme 表

---

## 2. CAM v2 设计原则

### 2.1 唯一真值来源

1. `utterance_texts` 是句段文本内容的唯一规范源
2. `tier_definitions` / `tier_annotations` 是通用 tier 体系的唯一规范源
3. `utterances` 负责时间段、对象归属、整体状态，不再承担规范文本存储
4. `utterance_tokens` / `utterance_morphemes` 是词级与形态素级编辑、备注、词汇链接的规范源
5. `audit_logs` 只负责审计事件，不承担对象 provenance 的唯一存储职责

### 2.2 缓存允许存在，但必须标注为派生字段

以下字段允许继续存在，但必须视为 derived cache：

- `utterance.startTime` / `endTime` 相对于 anchors
- `utterance.transcription` 相对于 `utterance_texts`
- `utterance.words` 相对于 `utterance_tokens` / `utterance_morphemes`

规则：

- 写入只改规范源
- 缓存由同步器或 adapter 回填
- 导出优先读取规范源，缓存只作 fallback

### 2.3 稳定 identity 优先于数组位置

一切可能被以下功能引用的语言学对象，都必须拥有稳定 `id`：

- utterance
- utterance text
- token
- morpheme
- tier annotation
- note
- AI suggestion / task result

这意味着 `targetIndex` 只能作为兼容定位信息，不能再作为主定位机制。

### 2.4 provenance 统一建模

“谁创建、如何创建、何时创建、是否确认、是否由 AI 生成”不能再散落在 `ai_metadata`、`sourceType`、`createdBy`、`method`、`audit_logs` 多套字段里，而应当有统一 envelope。

---

## 3. CAM v2 总体结构

建议分为 6 个子域。

### 3.1 Core Corpus

- `texts`
- `media_items`
- `anchors`
- `utterances`
- `utterance_texts`

### 3.2 Interlinear Linguistics

- `utterance_tokens` 新增
- `utterance_morphemes` 新增
- `token_lexeme_links` 由 `corpus_lexicon_links` 演进
- `tier_definitions`
- `tier_annotations`

### 3.3 Lexicon & Resources

- `lexemes`
- `languages`
- `speakers`
- `orthographies`
- `abbreviations`
- `phonemes`
- `tag_definitions`

### 3.4 Governance

- `user_notes`
- `audit_logs`

### 3.5 AI Runtime

- `ai_tasks` 新增
- `ai_task_results` 可选新增
- `ai_conversations` 新增

### 3.6 Retrieval / Knowledge Base

- `embeddings` 新增
- `document_chunks` 新增

---

## 4. 核心改动摘要

### 4.1 保留但降级的字段

#### `utterances.transcription`

现状：兼容旧编辑流与旧导入导出逻辑。

v2 处理：

- 保留字段
- 标注为 `@deprecated cache-only`
- 不允许新业务以此作为唯一读源

#### `utterances.words`

现状：适合轻量 UI，但没有稳定 identity。

v2 处理：

- 作为 UI cache 保留一段时间
- 新写入改为落 `utterance_tokens` / `utterance_morphemes`
- 导入服务可以先落规范表，再由派生器生成 `words` cache

### 4.2 新增稳定对象表

#### `utterance_tokens`

解决问题：

- `user_notes` 挂载 word 时不再依赖 index
- auto-gloss / search / highlight / concordance 有稳定对象
- 协同编辑可在 token 级别做对象合并

#### `utterance_morphemes`

解决问题：

- FLEx / Toolbox morpheme 级标注成为一等对象
- morpheme-level gloss / pos / lexeme link 可独立维护
- 规避“改动一个词导致整个 `words[]` 重写”的高冲突模式

### 4.3 provenance envelope 统一

新增统一结构：`ProvenanceEnvelope`

它不替代 `audit_logs`，而是给每个业务对象提供当前状态层面的来源描述；`audit_logs` 保留为事件流。

### 4.4 AI / RAG 系统表正式入模

当前计划中已经明确需要 embeddings、ai_conversations、RAG 文献块。

v2 原则：

- 不再让这些对象只存在于 service 设计稿里
- 先建立最小 schema，再逐步实现功能

---

## 5. 建议的统一基础类型

```ts
type ReviewStatus = 'draft' | 'suggested' | 'confirmed' | 'rejected';

type ActorType = 'human' | 'ai' | 'system' | 'importer';

type CreationMethod =
  | 'manual'
  | 'import'
  | 'auto-segmentation'
  | 'auto-transcription'
  | 'auto-gloss'
  | 'alignment'
  | 'projection'
  | 'merge'
  | 'split'
  | 'migration';

interface ProvenanceEnvelope {
  actorType: ActorType;
  actorId?: string;
  method: CreationMethod;
  taskId?: string;
  model?: string;
  modelVersion?: string;
  confidence?: number;
  createdAt: string;
  updatedAt?: string;
  reviewStatus?: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
}
```

说明：

- `ai_metadata` 可暂时兼容保留，但最终可并入 `provenance`
- `sourceType` 可退化为 `provenance.actorType` + `provenance.method`
- `isVerified` 最终可被 `reviewStatus` 替代

---

## 6. 关键表草案

### 6.1 utterances

职责：

- 时间段对象
- 归属 text / media / speaker
- 覆盖率、可见性、状态
- 不再承担规范文本或规范词级结构

```ts
interface UtteranceDocV2 {
  id: string;
  textId: string;
  mediaId?: string;
  speakerId?: string;
  languageId?: string;

  startTime: number;
  endTime: number;
  startAnchorId?: string;
  endAnchorId?: string;

  annotationStatus?:
    | 'raw'
    | 'segmented'
    | 'transcribed'
    | 'translated'
    | 'glossed'
    | 'verified';

  accessRights?: 'open' | 'restricted' | 'confidential';
  tags?: Record<string, boolean>;
  notes?: MultiLangString;
  provenance?: ProvenanceEnvelope;

  /** @deprecated cache-only */
  transcription?: Record<string, string>;

  /** @deprecated UI cache derived from utterance_tokens */
  words?: Array<unknown>;

  createdAt: string;
  updatedAt: string;
}
```

建议索引：

- `id`
- `textId`
- `mediaId`
- `[mediaId+startTime]`
- `[textId+startTime]`
- `speakerId`
- `annotationStatus`
- `updatedAt`

### 6.2 utterance_texts

职责：

- 某一 utterance 在某一 layer 上的规范文本/音频表达
- 句段层文本唯一规范源

```ts
interface UtteranceTextDocV2 {
  id: string;
  utteranceId: string;
  tierId: string;
  modality: 'text' | 'audio' | 'mixed';

  orthographyId?: string;
  languageId?: string;

  text?: string;
  translationAudioMediaId?: string;
  recordedBySpeakerId?: string;

  provenance?: ProvenanceEnvelope;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}
```

说明：

- 从语义上建议逐步把 `translationLayerId` 重命名为 `tierId`
- 这能消除“逻辑上 layer、物理上 tier”的命名撕裂

建议索引：

- `id`
- `utteranceId`
- `tierId`
- `[utteranceId+tierId]`
- `orthographyId`
- `updatedAt`

### 6.3 utterance_tokens

职责：

- 词级稳定对象
- 可挂 notes、lexeme links、AI suggestions、concordance hit

```ts
interface UtteranceTokenDoc {
  id: string;
  utteranceId: string;
  tierId?: string;
  tokenIndex: number;

  form: Record<string, string>;
  normalizedForm?: Record<string, string>;
  gloss?: MultiLangString;
  pos?: string;

  startTime?: number;
  endTime?: number;
  startAnchorId?: string;
  endAnchorId?: string;

  reviewStatus?: ReviewStatus;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}
```

建议索引：

- `id`
- `utteranceId`
- `[utteranceId+tokenIndex]`
- `pos`
- `updatedAt`

### 6.4 utterance_morphemes

职责：

- 形态素级稳定对象
- 支持 gloss / pos / lexeme link / 变体记录

```ts
interface UtteranceMorphemeDoc {
  id: string;
  tokenId: string;
  morphemeIndex: number;

  form: Record<string, string>;
  normalizedForm?: Record<string, string>;
  gloss?: MultiLangString;
  pos?: string;

  type?: 'root' | 'prefix' | 'suffix' | 'clitic' | 'infix' | 'unknown';
  delimiterBefore?: string;
  delimiterAfter?: string;

  reviewStatus?: ReviewStatus;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}
```

建议索引：

- `id`
- `tokenId`
- `[tokenId+morphemeIndex]`
- `pos`
- `updatedAt`

### 6.5 token_lexeme_links

职责：

- token 或 morpheme 与 lexeme 的稳定链接
- 替代当前 `corpus_lexicon_links` 对 utterance 级粗链接的局限

```ts
type LinkTargetType = 'utterance' | 'token' | 'morpheme' | 'tier_annotation';

interface TokenLexemeLinkDoc {
  id: string;
  targetType: LinkTargetType;
  targetId: string;
  lexemeId: string;
  senseIndex?: number;
  role?: 'primary' | 'candidate' | 'rejected';
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}
```

建议索引：

- `id`
- `[targetType+targetId]`
- `lexemeId`
- `[lexemeId+targetType]`

### 6.6 tier_definitions

职责：

- 保留通用 tier 框架
- 继续承载 transcription / translation / gloss / note / custom

建议新增字段：

```ts
interface TierDefinitionDocV2 {
  id: string;
  textId: string;
  key: string;
  name: MultiLangString;

  tierType: 'time-aligned' | 'time-subdivision' | 'symbolic-subdivision' | 'symbolic-association';
  contentType: 'transcription' | 'translation' | 'gloss' | 'pos' | 'note' | 'custom';

  parentTierId?: string;
  languageId?: string;
  orthographyId?: string;
  participantId?: string;
  dataCategory?: string;

  bridgeRole?: 'primary-text' | 'translation-layer' | 'derived-tier' | 'import-shadow';
  externalFormatHints?: Record<string, unknown>;

  modality?: 'text' | 'audio' | 'mixed';
  acceptsAudio?: boolean;
  isDefault?: boolean;
  accessRights?: 'open' | 'restricted' | 'confidential';
  delimiter?: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}
```

重点：

- `orthographyId` 比单纯 `languageId` 更适合多书写系统 tier
- `bridgeRole` 用于说明该 tier 是否是上层 layer 兼容桥接对象
- `externalFormatHints` 用于 EAF / FLEx / Toolbox 命名映射提示，避免 importer/exporter 到处堆 if/else

### 6.7 tier_annotations

职责：

- 保留通用 standoff 标注体系
- 面向 EAF / ELAN / power-user tier editing

建议字段：

```ts
interface TierAnnotationDocV2 {
  id: string;
  tierId: string;
  parentAnnotationId?: string;

  startTime?: number;
  endTime?: number;
  startAnchorId?: string;
  endAnchorId?: string;
  ordinal?: number;

  value: string;
  speakerId?: string;

  linkedTokenId?: string;
  linkedMorphemeId?: string;
  linkedLexemeId?: string;
  senseIndex?: number;

  hypotheses?: Array<{
    id: string;
    value: string;
    confidence?: number;
    provenance?: ProvenanceEnvelope;
  }>;

  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}
```

关键点：

- 把 `createdBy` / `method` 升级为通用 `provenance`
- hypothesis 也给稳定 `id`，避免后续批注/确认时只能按数组 index 更新

### 6.8 lexemes

当前 `lemma: Transcription` 是正确方向，但仍建议增强：

```ts
interface LexemeDocV2 {
  id: string;
  lemma: Record<string, string>;
  citationForm?: string;
  lexemeType?: string;
  morphemeType?: string;

  forms?: Array<{
    id: string;
    orthographyId?: string;
    transcription: Record<string, string>;
    usage?: 'variant' | 'historical' | 'preferred' | 'alternate';
  }>;

  senses: Array<{
    id: string;
    gloss: MultiLangString;
    definition?: MultiLangString;
    category?: string;
  }>;

  notes?: MultiLangString;
  tags?: Record<string, boolean>;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}
```

理由：

- `sense.id` 有利于稳定引用，而不是长期使用数组序号
- `forms[].id` 和 `orthographyId` 有利于多书写系统和正字法变体管理

### 6.9 orthographies

在现有 `scriptTag` / `conversionRules` 基础上，建议再补：

```ts
interface OrthographyDocV2 {
  id: string;
  languageId?: string;
  name: MultiLangString;
  abbreviation?: string;
  type?: 'phonemic' | 'phonetic' | 'practical' | 'historical' | 'other';

  bcp47Tag?: string;
  scriptTag?: string;
  direction?: 'ltr' | 'rtl' | 'ttb';

  tokenizationRules?: Record<string, unknown>;
  normalizationRules?: Record<string, unknown>;
  conversionRules?: Record<string, unknown>;

  notes?: MultiLangString;
  createdAt: string;
  updatedAt?: string;
}
```

这里的重点不是立刻实现规则引擎，而是把：

- 分词规则
- 归一化规则
- 正字法投射规则

三类规则拆开，避免未来把不同语义都塞进 `conversionRules`。

### 6.10 user_notes

当前方向正确，但建议增强稳定对象引用：

```ts
interface UserNoteDocV2 {
  id: string;
  targetType:
    | 'text'
    | 'utterance'
    | 'utterance_text'
    | 'token'
    | 'morpheme'
    | 'tier_annotation'
    | 'lexeme'
    | 'sense'
    | 'orthography'
    | 'ai_task';

  targetId: string;
  parentTargetId?: string;
  content: MultiLangString;
  category?: 'comment' | 'question' | 'todo' | 'linguistic' | 'fieldwork' | 'correction';
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}
```

说明：

- `word` / `morpheme` 这种 index 级 target 建议迁移为 `token` / `morpheme` 实体 id
- 允许 note 直接挂在 `ai_task`，利于人机协同审阅

### 6.11 ai_tasks

职责：

- AI 任务队列、重试、取消、状态跟踪、上下文快照

```ts
interface AiTaskDoc {
  id: string;
  taskType:
    | 'transcribe'
    | 'align'
    | 'gloss'
    | 'translate'
    | 'summarize'
    | 'embed'
    | 'rag-index'
    | 'orthography-project';

  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  targetType?: 'text' | 'utterance' | 'token' | 'morpheme' | 'document';
  targetId?: string;

  provider?: string;
  model?: string;
  modelVersion?: string;
  parameters?: Record<string, unknown>;
  contextSnapshot?: Record<string, unknown>;

  resultRefType?: 'utterance_text' | 'tier_annotation' | 'embedding' | 'document_chunk';
  resultRefId?: string;

  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 6.12 embeddings

职责：

- 统一管理 utterance / note / pdf / schema 的向量

```ts
interface EmbeddingDoc {
  id: string;
  sourceType: 'utterance' | 'note' | 'pdf' | 'schema';
  sourceId: string;

  provider?: string;
  model: string;
  modelVersion?: string;
  dimensions: number;
  vector: Float32Array;

  languageId?: string;
  tierId?: string;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}
```

### 6.13 document_chunks

职责：

- 为 PDF / 文献 / 说明文档做 RAG chunk 存储

```ts
interface DocumentChunkDoc {
  id: string;
  documentId: string;
  sourceType: 'pdf' | 'note-export' | 'schema-doc';
  chunkIndex: number;
  page?: number;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

---

## 7. 关键不变量

CAM v2 建议明确写成 schema invariant。

1. 任意 `utterance_text` 必须指向存在的 `utterance` 和 `tier`
2. `utterance_tokens` 的 `tokenIndex` 在同一 utterance 内唯一
3. `utterance_morphemes` 的 `morphemeIndex` 在同一 token 内唯一
4. `token_lexeme_links.targetId` 必须与 `targetType` 对应实体存在
5. `tier_annotation.hypotheses[].id` 在 annotation 内唯一
6. `user_notes.targetId` 必须优先引用稳定对象 id，而不是 index
7. `utterance.transcription` 与 `utterance.words` 若存在，只能作为 cache，不作为唯一规范源
8. `reviewStatus='confirmed'` 的对象若再被 AI 修改，必须降级回 `suggested` 或产生新对象版本

---

## 8. 与当前 schema 的差异

### 8.1 当前 schema 保持不动的部分

- `texts`
- `media_items`
- `anchors`
- `languages`
- `speakers`
- `abbreviations`
- `phonemes`
- `bibliographic_sources`
- `grammar_docs`

这些表当前没有明显结构性错误，主要问题在索引和扩展字段，而不是建模方向。

### 8.2 建议演进而非推倒重来的部分

- `utterances`
- `utterance_texts`
- `lexemes`
- `orthographies`
- `tier_definitions`
- `tier_annotations`
- `user_notes`

### 8.3 建议新增的表

- `utterance_tokens`
- `utterance_morphemes`
- `ai_tasks`
- `embeddings`
- `document_chunks`
- `ai_conversations`（若按 F31 落地）

### 8.4 建议逐步退出主流程的字段/概念

- `utterance.transcription` 作为主写源
- `utterance.words[]` 作为唯一词级结构
- `translationLayerId` 这个命名长期存在于新接口中
- `wordIndex` 作为 token 唯一定位方式
- `senseIndex` 作为长期稳定引用方式

---

## 9. migration 建议

### Phase A：低风险补强

目标：不新增物理表，只统一语义。

动作：

1. 在所有新写路径中明确 `utterance_texts` 为规范源
2. 新增 `provenance` 到 `utterance_texts` / `tier_annotations` / `user_notes`
3. 给 `lexeme.senses[]` 和 `tier_annotation.hypotheses[]` 增加稳定 `id`
4. 在文档中把 `utterance.transcription` 标注为 cache-only

### Phase B：稳定 token identity

目标：引入 `utterance_tokens` / `utterance_morphemes`。

动作：

1. migration 时从 `utterance.words` 回填 token / morpheme 表
2. `user_notes` 逐步迁移到 token/morpheme id
3. `corpus_lexicon_links` 升级为 `token_lexeme_links`
4. UI 读 token 表，必要时回写 `words` cache

### Phase C：AI / RAG 系统表

目标：把运行时对象纳入 schema。

动作：

1. 建 `ai_tasks`
2. 建 `embeddings`
3. 建 `document_chunks`
4. 建 `ai_conversations`

### Phase D：命名与兼容收敛

目标：结束 layer / tier 双命名撕裂。

动作：

1. 新 API 统一使用 `tierId`
2. adapter 层继续兼容旧的 `translationLayerId`
3. exporter/importer 内部逐步全部切换到 tier 语义

---

## 10. 为什么不建议继续把 token/morpheme 只放在 utterance.words 里

短期优点：

- 简单
- UI 直接读写方便
- 导入导出代码直观

长期问题：

- 无稳定 id，备注和 AI suggestion 会漂移
- 单个词改动会重写整段结构，协同编辑冲突大
- 无法高效做 token 级索引、搜索、统计、KWIC
- lexeme link 与 reviewStatus 只能依附在数组项上，生命周期脆弱

结论：

- `words` 适合作为 view model
- 不适合作为长期 canonical storage

---

## 11. 为什么不建议让 tier_annotations 完全替代 token/morpheme 表

`tier_annotations` 是必须保留的，因为它对 EAF/ELAN 和通用 tier 编辑很重要。

但如果只保留 tier_annotations：

- token / morpheme 的高频查询会变复杂
- 词典链接会落到通用 annotation 上，语义不够清晰
- note / search / AI suggestion 都要先解释 tier 语义才能工作

因此更合理的做法是：

- `tier_annotations` 负责“通用层编辑与互操作”
- `utterance_tokens` / `utterance_morphemes` 负责“规范化语言学结构与高频业务”

两者之间通过 `linkedTokenId` / `linkedMorphemeId` 建桥，而不是二选一。

---

## 12. 对未来功能的影响评估

---

## 11.5 三类标注模型分工契约（必须执行）

你指出的核心问题是对的：

- `utterance.words/morphemes`（嵌入式）
- `tier_annotations`（standoff）
- `corpus_lexicon_links` / `token_lexeme_links`（关联式）

目前都能表达“词/形态素与词条、释义、层级”，如果没有硬规则，后续 auto-gloss、批量编辑、一致性检查、协同编辑会发生双写漂移。

### A. 先给出唯一职责（Single Responsibility）

1. 嵌入式结构：`utterance.words/morphemes`
  - 角色：UI cache / 导入导出兼容层
  - 不负责：长期主写入、跨对象稳定引用、并发合并

2. standoff 结构：`tier_annotations`
  - 角色：通用层标注表达（ELAN/EAF/高级 tier 编辑）
  - 不负责：词级 canonical 存储（除非明确是 tier-first 项目）

3. link 结构：`token_lexeme_links`（过渡期含 `corpus_lexicon_links`）
  - 角色：只表达“对象 -> 词条/义项”的关系
  - 不负责：承载词形文本本体、承载层级时间边界

### B. 决策矩阵（什么场景写哪里）

1. 用户在“词/形态素编辑器”中改词形、拆分、词性、gloss：
  - 主写：`utterance_tokens` / `utterance_morphemes`
  - 同步：必要时回写 `words` cache
  - 不写：`tier_annotations`（除非该动作来自 tier 编辑器）

2. 用户在“tier 轨道”上编辑 annotation（含时间段、父子层）：
  - 主写：`tier_annotations`
  - 可选桥接：`linkedTokenId` / `linkedMorphemeId`
  - 不直接改：lexeme link（除非用户显式确认）

3. 用户确认“这个 token 对应词条/义项”：
  - 主写：`token_lexeme_links`
  - 不写：`utterance_tokens.gloss` 以外的冗余词条字段

4. 导入 FLEx/Toolbox：
  - 主写：token/morpheme canonical（Phase B 完成后）
  - 兼容写：`words` cache
  - tier 映射仅在输入本身有 tier 语义时写 `tier_annotations`

5. auto-gloss 批量建议：
  - 建议写：`token_lexeme_links(role='candidate')` + `provenance.reviewStatus='suggested'`
  - 不直接覆盖 confirmed 数据

### C. 读路径优先级（Read Priority）

统一读规则，防止不同页面读到不同真值：

1. 词级页面：先读 token/morpheme canonical；没有才回退 `words` cache
2. tier 页面：先读 `tier_annotations`
3. 词典联动：先读 `token_lexeme_links`，再回退旧 `corpus_lexicon_links`
4. 导出器：按目标格式选择
  - ELAN/EAF 导出优先 tier
  - FLEx/Toolbox 导出优先 token/morpheme

### D. 禁止事项（Hard Rules）

1. 禁止同一用户动作同时“主写”两个 canonical 源
2. 禁止把 `corpus_lexicon_links` 继续当作词级长期主关联
3. 禁止新功能直接依赖 `wordIndex` 作为稳定定位
4. 禁止 auto-gloss 覆盖 `reviewStatus='confirmed'` 的对象

### E. 过渡期兼容策略（到 Phase D 前）

1. 允许 `words` 与 token 表并存，但任何写入必须先 canonical 后 cache
2. 允许 `corpus_lexicon_links` 继续被读取，但新写入只写 `token_lexeme_links`
3. 在服务层增加“单入口归一化器”，禁止页面直接散写三个模型

### F. 这套分工对四个关键能力的直接收益

1. auto-gloss：候选与确认态分离，不再污染人工确认结果
2. 批量编辑：编辑粒度落到 token/morpheme，避免整段重写
3. 一致性检查：检查对象唯一，规则更可复现
4. 协同编辑：冲突粒度从“整句数组”降到“词对象”，可合并性显著提升

### F12 auto-gloss

受益点：

- token / morpheme 稳定 id 后，候选 gloss 与确认状态更好管理
- `token_lexeme_links` 能表达 primary/candidate/rejected

### F19 搜索 / KWIC / Concordance

受益点：

- 可直接索引 token 表
- 可按 orthography / pos / gloss / lexeme 精确过滤

### F28 embeddings

受益点：

- `embeddings.sourceType + sourceId` 统一引用各类对象
- 不需要每个 service 自造 embedding metadata

### F31 / F32 AI Sidekick / RAG

受益点：

- `ai_tasks` 统一任务生命周期
- `document_chunks` + `embeddings` 成为标准检索底座
- provenance 统一后，AI 结果可追溯、可审核、可回滚

### 协同编辑 PoC

受益点：

- token / morpheme 级对象比嵌入数组更适合 CRDT
- 冲突粒度更细，回放更稳定

---

## 13. 建议的实施顺序

建议不要一次切到完整 CAM v2，而是按以下顺序实施：

1. 先做语义收敛：明确规范源、补 `provenance`
2. 再做稳定 identity：落 token/morpheme 表
3. 再做 AI / retrieval 系统表
4. 最后做命名收敛与兼容清理

如果资源只够做一件事，优先级最高的是：

**先把 token / morpheme 从“数组项”升级成“稳定对象”。**

这是后续 note、AI、搜索、协同、词典链接能否长期可维护的分水岭。

---

## 14. 结论

CAM v1 / 当前 schema 的问题，不是字段太少，而是：

- source of truth 还没彻底收敛
- token / morpheme 还没有稳定 identity
- provenance 还是分散字段
- AI / RAG 对象还没有进入正式 schema

CAM v2 的核心不是“加更多字段”，而是把：

1. 规范源
2. 稳定对象身份
3. 统一 provenance
4. 系统级 AI / retrieval 表

这四件事一次讲清楚。

只要这四件事立住，后续功能都还是在正确轨道上加法；否则代码会继续增长，但结构债会在 note、AI、搜索、协同四个方向同时放大。

---

## 15. Phase A/B 首轮落地记录（2026-03-17）

本节记录“草案 -> 代码”的首轮对齐结果，避免后续评审时把已完成事项误判为待实现。

### 15.1 已落地项

1. 统一 provenance 类型已进入主 schema
  - 新增 `ReviewStatus`、`ActorType`、`CreationMethod`、`ProvenanceEnvelope`
  - 已接入 `utterance_texts`、`tier_annotations`、`user_notes`

2. `word` / `morpheme` 稳定 identity 已首轮落地
  - `UtteranceWord.id?` 与 `Morpheme.id?` 已进入类型与校验层
  - 新写入路径会自动补齐缺失 id

3. 历史数据迁移已落地
  - Dexie `version(15)` 已加入回填逻辑
  - 对历史 `utterances.words[*]` 与 `morphemes[*]` 缺失 id 进行自动回填

4. 写入链路归一化已收口
  - 新增 `src/utils/camDataUtils.ts`
  - `normalizeUtteranceDocForStorage`
  - `normalizeUtteranceTextDocForStorage`
  - `normalizeTierAnnotationDocForStorage`
  - `normalizeUserNoteDocForStorage`
  - `ensureStableWordStructure`

5. 导入链路已接入稳定 id 归一化
  - FLEx 与 Toolbox 导入结果在入库前会补齐 `word`/`morpheme` 稳定 id

### 15.2 已验证状态

1. TypeScript typecheck 通过
2. 全量测试通过（26 files / 227 tests）

### 15.3 仍未开始项（下一步）

1. `utterance_tokens` / `utterance_morphemes` 物理表（Phase B 深化）
2. `token_lexeme_links` 从 `corpus_lexicon_links` 的实体级迁移
3. `ai_tasks` / `embeddings` / `document_chunks`（Phase C）
4. 新 API 命名统一到 `tierId`（Phase D）

---

## 16. 行业对标：ELAN / FLEx / LaBB-CAT / INCEpTION 与 CAM v2

本节目标不是“照搬某个产品”，而是提炼其稳定原则，回答当前解语的核心问题：

- 三套标注模型并存是否合理
- 如果合理，如何明确主写边界与读路径优先级

### 16.1 四类产品的典型架构取向

1. ELAN（EAF）
  - 主体是多层 tier 的 standoff 标注
  - 强项是时间对齐、层级依赖、可视化编辑
  - 设计重心是“annotation on timeline”，不是词典驱动或 token-first 存储

2. FLEx（FieldWorks）
  - 主体是 lexicon-first + interlinear 联动
  - 强项是词条、词形、释义的一致性维护（single source consistency）
  - 设计重心是“词汇对象稳定身份 + 全局一致更新”

3. LaBB-CAT
  - 主体是 time-aligned transcript + 分层检索索引
  - 强项是层级查询、批量自动标注、语料检索闭环
  - 设计重心是“可检索的层级标注仓库”，而不是前端编辑结构本身

4. INCEpTION
  - 主体是 layer/feature standoff + 协作标注/裁决
  - 强项是多层注释、一致性治理、推荐器辅助、知识库链接
  - 设计重心是“注释任务治理平台”，不是单一格式导入器

### 16.2 与解语当前架构的异同

相同点：

1. 解语已有 tier 体系（`tier_definitions` / `tier_annotations`），与 ELAN/INCEpTION 的分层思想同向
2. 解语已有 lexicon 体系（`lexemes` + links），与 FLEx 的词汇中心思想同向
3. 解语已规划 embeddings/RAG，和 LaBB-CAT/INCEpTION 的检索增强方向同向

关键差异：

1. 其他产品通常只有一个“主写核心”
  - ELAN/INCEpTION：standoff annotation 是核心
  - FLEx：lexicon/interlinear 对象是核心
  - 解语目前是三模型并行可写，主写边界尚在收敛中

2. 其他产品把“稳定 identity”放在一开始
  - FLEx/INCEpTION 对象引用稳定，不依赖数组索引
  - 解语 v15 前词级仍有 index 依赖，当前已做首轮修复，但 token 表尚未物化

3. 其他产品把“治理层”显式产品化
  - INCEpTION 有 curation/agreement/workload/recommender 的闭环
  - 解语治理语义（review/provenance）已入模，但流程还在建设期

### 16.3 可复用的三条行业经验

1. 经验 A：允许多表示层，但只允许一个 canonical 写入层
  - 对应解语：保留 `words` cache 与 `tier_annotations`，但词级编辑必须主写 token/morpheme canonical

2. 经验 B：词典链接必须是关系对象，不应混入文本对象本体
  - 对应解语：把词条关联集中到 `token_lexeme_links`，避免散落在多处字段

3. 经验 C：建议与确认必须是不同状态，不得直接覆盖
  - 对应解语：`reviewStatus` + `provenance` 已具备基础，后续要在批量流程中强制执行

### 16.4 对“三模型并存”的最终判断

结论：并存是合理的，但必须是“分层并存”，不是“竞争并存”。

1. `utterance.words/morphemes`
  - 定位：兼容与 UI cache
  - 不能作为长期主写模型

2. `tier_annotations`
  - 定位：通用 standoff 层、格式互操作、时间层编辑
  - 不承接词级 canonical 主写（除非明确 tier-first 工程）

3. `token_lexeme_links`
  - 定位：唯一词典关系层
  - 只表达关系，不承载 token 文本本体

### 16.5 对 v16-v17 的落地建议（按收益/风险排序）

1. v16：先把 token/morpheme 物化为实体表（最高优先级）
  - 完成 `utterance_tokens` / `utterance_morphemes`
  - 页面读路径切到 canonical-first，`words` 作为 fallback

2. v16：冻结 link 主写入口
  - 新增/切换到 `token_lexeme_links`
  - 旧 `corpus_lexicon_links` 仅保留读取兼容

3. v17：把 auto-gloss 批量任务改为“候选关系写入”
  - 写 `role='candidate'` + `reviewStatus='suggested'`
  - 人工确认后升格 primary，拒绝则标 rejected

4. v17：补齐一致性巡检任务
  - 检查“同一操作是否双主写”
  - 检查 confirmed 对象是否被 AI 直接覆盖
  - 检查 index 定位是否仍出现在新链路

### 16.6 对 CAM v2 主线的影响

行业对标支持当前 CAM v2 主线判断：

1. 不需要回退“三模型并存”方案
2. 需要尽快完成“主写契约 + 稳定 identity + 关系层收敛”三件事
3. 在这三件事完成前，不建议扩张更多上层自动化能力

一句话总结：

解语应采用“ELAN/INCEpTION 的层级表达能力 + FLEx 的词汇一致性哲学 + LaBB-CAT 的检索闭环思路”，
并通过 CAM v2 的 canonical 契约把三套模型组织成单向数据流，而不是互相覆盖的多向写入。

---

## 17. 可执行 DoD 验收清单（v16-v17）

本节用于把第 16 章结论转成可落地任务。每个条目满足 DoD 后才能进入下一阶段。

### 17.1 v16-1：token/morpheme 物化为 canonical 实体

目标：

- 让词级与形态素级写入拥有稳定对象身份
- 页面读路径实现 canonical-first，`words` 仅 fallback

DoD：

- [ ] 新增 `utterance_tokens` / `utterance_morphemes` schema 与 migration
- [ ] 写入路径在保存 utterance 编辑结果时先落 token/morpheme canonical
- [ ] 页面读取优先 token/morpheme，缺失时才回退 `utterance.words`
- [ ] `user_notes` 新建时禁止再生成基于 index 的 token 定位
- [ ] 类型检查与测试全绿

代码触点（首批）：

- `db.ts`
- `src/utils/camDataUtils.ts`
- `services/LinguisticService.ts`
- `src/hooks/useTranscriptionData.ts`
- `src/pages/TranscriptionPage.tsx`
- `src/hooks/useNotes.ts`

验收测试（首批）：

- `src/utils/camDataUtils.test.ts`
- `services/LinguisticService.test.ts`
- `services/FlexService.test.ts`
- `services/ToolboxService.test.ts`

### 17.2 v16-2：词典链接主写收敛到 token_lexeme_links

目标：

- 建立唯一关系层，停止多处重复承载词条关系

DoD：

- [ ] 新增 `token_lexeme_links`（或等价表）并建立必要索引
- [ ] 新写入只写 `token_lexeme_links`，旧 `corpus_lexicon_links` 仅读兼容
- [ ] lexicon 相关 UI 的读路径改为新关系层优先
- [ ] 对历史链接执行一次可回滚迁移脚本
- [ ] 类型检查与测试全绿

代码触点（首批）：

- `db.ts`
- `src/pages/LexiconPage.tsx`
- `services/LinguisticService.ts`
- `services/LayerTierUnifiedService.ts`

验收测试（首批）：

- `services/LayerTierUnifiedService.test.ts`
- `services/LinguisticService.test.ts`

### 17.3 v17-1：auto-gloss 改为“候选关系 + 审核确认”

目标：

- AI 结果默认不覆盖人工确认
- 形成 suggested -> confirmed/rejected 的显式状态流

DoD：

- [ ] auto-gloss 输出只生成 `role='candidate'` 关系与 `reviewStatus='suggested'`
- [ ] 人工确认动作可把 candidate 升级为 primary
- [ ] 人工拒绝动作写入 rejected（保留 provenance）
- [ ] 对 `reviewStatus='confirmed'` 对象设置防覆盖保护
- [ ] 类型检查与测试全绿

代码触点（首批）：

- `services/LinguisticService.ts`
- `src/hooks/useTranscriptionData.ts`
- `src/pages/TranscriptionPage.tsx`
- `src/hooks/useNotes.ts`

验收测试（首批）：

- `services/LinguisticService.test.ts`
- `src/utils/camDataUtils.test.ts`

### 17.4 v17-2：一致性巡检与回归门禁

目标：

- 防止后续功能回退到双主写或 index 定位

DoD：

- [ ] 增加一致性检查：同一用户动作只允许一个 canonical 主写
- [ ] 增加一致性检查：新链路中不得新增 index-only 定位
- [ ] 增加一致性检查：confirmed 对象不被 AI 直接覆盖
- [ ] CI 增加最小回归门禁（typecheck + vitest）
- [ ] 失败信息可定位到具体对象与写入链路

代码触点（首批）：

- `src/utils/camDataUtils.ts`
- `services/LinguisticService.ts`
- `services/FlexService.ts`
- `services/ToolboxService.ts`

验收测试（首批）：

- `src/utils/camDataUtils.test.ts`
- `services/FlexService.test.ts`
- `services/ToolboxService.test.ts`

### 17.5 统一验收命令（每阶段完成后执行）

- `npm run typecheck`
- `npm test`

阶段完成判定：

- DoD 清单项全部勾选
- 上述命令通过
- 草案第 15 节实施进展同步更新为“已完成/进行中”

---

## 18. 下一步改进方案（执行版）

本方案基于第 16 章对标结论与第 17 章 DoD，按“先稳核心写入，再扩展自动化”的顺序推进。

### 18.1 总体策略

1. 先做数据主链路收敛，再做功能扩张
2. 任何阶段都以“可回滚迁移 + 测试可验证”为前提
3. 保持兼容层，但禁止新增兼容债

执行原则：

- 新功能只能接 canonical 写入层
- 旧字段只读兼容，不再新增写入入口
- 每阶段结束必须跑 `npm run typecheck` 与 `npm test`

### 18.2 分阶段改进路径

#### Phase 1（1-2 周）：完成 canonical token/morpheme 落地

目标：

- 把词级对象从数组项升级为实体对象
- 建立 canonical-first 读写路径

实施项：

1. 在 `db.ts` 增加 `utterance_tokens` / `utterance_morphemes` 与索引
2. 迁移脚本从 `utterances.words` 回填 token/morpheme 实体
3. 在 `services/LinguisticService.ts`、`src/hooks/useTranscriptionData.ts`、`src/pages/TranscriptionPage.tsx` 实现先写 canonical、后回填 cache
4. 在 `src/hooks/useNotes.ts` 停止新建 index-only 定位

交付物：

- 新表 migration
- canonical-first 写入
- 回退兼容读取
- 对应测试补齐

#### Phase 2（1 周）：词典关系层收敛

目标：

- 词典关系统一写入 `token_lexeme_links`

实施项：

1. 增加 `token_lexeme_links` 表与索引
2. 词典链接操作统一走关系层写入
3. `corpus_lexicon_links` 转为只读兼容
4. 在 `src/pages/LexiconPage.tsx` 完成新旧读路径切换

交付物：

- 关系层主写切换
- 历史数据迁移
- 兼容读取保持可用

#### Phase 3（1-2 周）：auto-gloss 审核化

目标：

- AI 建议不再直接覆盖人工确认值

实施项：

1. auto-gloss 结果写为 `candidate + suggested`
2. 增加“确认为 primary / 拒绝为 rejected”动作
3. 对 `confirmed` 数据增加防覆盖检查
4. 在服务层统一写 `provenance + reviewStatus`

交付物：

- 候选态与确认态完整流转
- confirmed 防覆盖门禁

#### Phase 4（1 周）：一致性巡检与发布门禁

目标：

- 防止未来迭代回退为双主写或 index 定位

实施项：

1. 增加一致性检查器（双主写、index-only、confirmed 覆盖）
2. 把巡检并入测试流程
3. 发布前强制执行 typecheck/test

交付物：

- 巡检规则集
- CI/本地一致门禁

### 18.3 风险与缓解

1. 风险：迁移后历史数据出现孤儿链接
  - 缓解：迁移前快照 + 迁移后一致性扫描 + 可回滚脚本

2. 风险：页面切换 canonical-first 后性能回退
  - 缓解：保留 cache fallback + 增加热点查询索引 + 分页加载

3. 风险：导入器行为变化导致格式回归
  - 缓解：优先补 `services/FlexService.test.ts` 与 `services/ToolboxService.test.ts` 的回归用例

### 18.4 回滚策略

1. 每个 migration 版本必须提供 downgrade 说明（至少逻辑回滚路径）
2. 新写入口保留 feature flag，异常时可切回兼容读写
3. 任何阶段出现数据一致性故障，先冻结新写入，再执行回滚脚本

### 18.5 首周执行清单（可直接开工）

1. 定义 `utterance_tokens` / `utterance_morphemes` 表结构与索引（`db.ts`）
2. 编写从 `words` 回填实体的 migration 草稿（`db.ts`）
3. 在 `src/utils/camDataUtils.ts` 增加“canonical-first 组装/回填”辅助函数
4. 接入 `services/LinguisticService.ts` 与 `src/hooks/useTranscriptionData.ts` 的写路径
5. 补 `src/utils/camDataUtils.test.ts` 与 `services/LinguisticService.test.ts`
6. 执行 `npm run typecheck` 与 `npm test`

### 18.6 进入下一阶段的闸门条件

1. 当前阶段 DoD 全部勾选
2. 全量 typecheck/test 通过
3. 关键链路人工回归通过：
  - 转写编辑
  - FLEx 导入
  - Toolbox 导入
  - 词典链接

---

## 19. 对标产品后的彻底优化方案（终局版）

本节目标是“一次性解决并存模型漂移问题”，不是继续做局部补丁。

### 19.1 终局架构目标（借鉴 ELAN/FLEx/LaBB-CAT/INCEpTION）

终局采用“三层一流”架构：

1. Canonical 实体层（词级真值层）
  - `utterance_tokens` / `utterance_morphemes`
  - 负责词形、形态素、状态、审核与可追溯 identity
  - 对标 FLEx 的“稳定词汇对象”理念

2. Standoff 表达层（时间与层级表达）
  - `tier_definitions` / `tier_annotations`
  - 负责时间轴、层级关系、互操作表达
  - 对标 ELAN/INCEpTION 的“层级注释表达”

3. Link 关系层（词典与知识连接）
  - `token_lexeme_links`（逐步替代 `corpus_lexicon_links` 主写）
  - 只表达关系，不存文本本体
  - 对标 FLEx/INCEpTION 的关系对象化实践

数据流要求（必须满足）：

- 单向流：Canonical -> Standoff/Link（必要映射）
- 禁止反向覆盖：表达层与关系层不得直接覆盖 Canonical
- 建议流与确认流分离：AI 只能写 suggested/candidate

### 19.2 一次性解决“并存漂移”的四条硬约束

1. 单动作单主写（Single Writer Rule）
  - 一次用户动作只能落一个主写层
  - 其它层只能做映射或缓存，不得主写

2. 稳定 identity 强制化
  - token/morpheme/note/annotation/link 必须有稳定 id
  - 禁止 index-only 作为新链路主定位

3. 审核态保护
  - `reviewStatus='confirmed'` 对象禁止被 AI 直接覆盖
  - AI 修改必须走新候选对象或降级到 suggested

4. 写入收口
  - 页面层和导入层不得直接散写三套模型
  - 统一通过归一化入口（service/util）执行业务写入

### 19.3 与对标产品的“取长补短”映射

1. 取 ELAN：层级/时间表达能力
  - 保留并强化 `tier_annotations`，用于互操作与时间编辑

2. 取 FLEx：词汇对象一致性
  - 把 token/morpheme 作为稳定实体，词典链接关系对象化

3. 取 LaBB-CAT：检索闭环
  - 后续以 token/morpheme + links 做检索索引，不再依赖数组结构

4. 取 INCEpTION：治理闭环
  - 用 provenance/reviewStatus 建立 suggested/confirmed/rejected 流程

### 19.4 实施里程碑（彻底解法，不回头）

#### M1：写入契约冻结（1 周）

目标：先止血，立即消除双写漂移新增。

交付：

1. 发布“单动作单主写”规则到代码与文档
2. 在写入入口加入双主写阻断
3. 新增 index-only 定位拦截

完成判定：

- 新功能 PR 中无双主写路径
- typecheck/test 通过

#### M2：Canonical 物化与读路径切换（2 周）

目标：把词级真值正式收敛到实体层。

交付：

1. `utterance_tokens` / `utterance_morphemes` migration
2. canonical-first 读取，上保兼容 fallback
3. 导入链路回填稳定 id

完成判定：

- 关键页面使用 canonical-first
- 导入回归用例通过

#### M3：关系层收敛与审核流固化（2 周）

目标：完成词典关系主写切换，AI 建议不污染人工确认。

交付：

1. `token_lexeme_links` 主写切换
2. auto-gloss 写 candidate/suggested
3. confirm/reject 操作闭环

完成判定：

- confirmed 覆盖违规为 0
- 词典链接写入仅剩关系层主入口

#### M4：发布门禁与运营指标（1 周）

目标：确保后续迭代不回退。

交付：

1. 一致性巡检脚本纳入 CI
2. 发布门禁：typecheck + tests + 巡检
3. 运行指标看板（见 19.6）

完成判定：

- 连续两个迭代无结构性回退

### 19.5 风险与处置预案（终局版）

1. 风险：历史数据不完整导致迁移失败
  - 处置：迁移前快照，迁移后孤儿扫描，失败自动回滚

2. 风险：切换 canonical-first 后性能波动
  - 处置：增加组合索引，热点缓存仅做读优化，禁止写反向回灌

3. 风险：导入器与主写契约冲突
  - 处置：导入先落 canonical，再映射表达层；导入失败不写脏数据

4. 风险：单人开发负荷过高
  - 处置：按 M1->M4 严格顺序，不并行开新战线

### 19.6 成功指标（Definition of Success）

上线后按周观察以下指标，连续 4 周达标视为“彻底解决”。

1. 双主写违规数：0
2. index-only 新写入数：0
3. confirmed 被 AI 覆盖数：0
4. 导入回归失败率：< 1%
5. 关键编辑链路错误率：持续下降

### 19.7 单人开发建议（严格版）

1. 每周只推进一个里程碑，不跨阶段
2. 每次改动最多覆盖 2-3 条主链路
3. 每次合并必须带回归测试
4. 未达到阶段闸门条件，不进入下一阶段

结论：

彻底解法不是“删掉其中两套模型”，而是通过终局架构把三套模型变成有严格分工的单向系统：

- Canonical 决定真值
- Standoff 负责表达
- Link 负责关联

只要四条硬约束与 M1-M4 里程碑执行到位，并存模型将从“冲突源”转为“协作层”。