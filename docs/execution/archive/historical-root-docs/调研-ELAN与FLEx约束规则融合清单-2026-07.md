> 文档角色：调研文档（设计草稿）。本文保留 ELAN + FLEx 约束规则融合的对比与规则清单草案，**不直接代表仓库当前已采用实现**。当前标注 / 层约束的真源以 [标注页与词典页开发路线图（重构版）](../../plans/标注页与词典页开发路线图-2026-04-25.md) 的 SSOT 段与 [规划-层约束收敛与time_subdivision落地方案-2026-07.md](./规划-层约束收敛与time_subdivision落地方案-2026-07.md) 为准。

## 融合 ELAN + FLEx 的约束规则清单

先厘清两套系统的核心差异，再给出统一规则表。

### ELAN vs FLEx 模型对比

| 维度 | ELAN | FLEx |
|------|------|------|
| 核心组织 | **时间线驱动**：annotation 挂在 tier 上，tier 间通过 stereotype 约束 | **语言结构驱动**：Text → Paragraph → Segment → Word → Morpheme |
| 时间对齐 | 根 tier time-aligned；子 tier 可继承或切分时间 | 仅 Segment 级有时间戳；Word/Morpheme 不直接绑定时间 |
| 独有约束 | time-subdivision 需无缝覆盖父区间 | **concatenation**：morpheme 拼接 ≡ word；word 拼接 ≡ segment |
| 词典关联 | 不强制 | **强制**：morpheme analysis 必须链接到 lexicon entry (sense) |
| 分析一致性 | 无 | **同形一致**：相同 wordform 应复用相同 approved analysis |
| POS/Gloss | 任意 tier 附加 | 严格 1:1：每个 morpheme 一个 gloss，每个 word 一个 category |

### 统一约束规则清单

分四个域，每条标明来源和严格等级。

#### I. 时间约束（ELAN 系）

| # | 规则 | 适用 tierType | 严格等级 | 描述 |
|---|------|---------------|----------|------|
| T1 | `time-bounds` | time-aligned, time-subdivision | **error** | $0 \leq startTime < endTime$；若已知 media duration，$endTime \leq duration$ |
| T2 | `no-overlap` | time-aligned | **error** | 同 tier 内、同 parent 下的 annotations 时间区间互不重叠 |
| T3 | `included-in-parent` | time-subdivision | **error** | 子 $[start, end] \subseteq$ 父 $[start, end]$ |
| T4 | `subdivision-contiguous` | time-subdivision | **warning** | 子 annotations 按时间排列后相邻区间无空隙 |
| T5 | `subdivision-covers` | time-subdivision | **warning** | 子区间的并集完全覆盖父 $[start, end]$ |
| T6 | `no-time-on-symbolic` | symbolic-subdivision, symbolic-association | **error** | 这两类 tier 的 annotation 不应有 startTime/endTime |

#### II. 结构约束（ELAN + FLEx 共有）

| # | 规则 | 适用范围 | 严格等级 | 描述 |
|---|------|----------|----------|------|
| S1 | `parent-annotation-exists` | 所有非根 tier 的 annotation | **error** | `parentAnnotationId` 指向的 annotation 必须存在且属于父 tier |
| S2 | `tier-type-match` | 所有 | **error** | annotation 的字段模式与所属 tier 的 `tierType` 一致（time 类有时间，symbolic 类无时间有 ordinal 等） |
| S3 | `one-to-one` | symbolic-association | **error** | 每个父 annotation 最多有 1 个该 tier 的子 annotation |
| S4 | `ordinal-sequential` | symbolic-subdivision | **warning** | 同一父下的 ordinal 从 0 起连续递增，无空洞 |
| S5 | `tier-dag-acyclic` | tier 定义层 | **error** | `parentTierId` 形成的有向图必须是 DAG（无环） |
| S6 | `tier-parent-type-compatible` | tier 定义层 | **error** | 子 tier 的 `tierType` 必须与父 tier 兼容（见下方兼容矩阵） |

**tierType 兼容矩阵**（子 → 可选的父类型）：

| 子 tierType | 允许的父 tierType |
|-------------|-------------------|
| time-aligned | *(无父，根 tier)* |
| time-subdivision | time-aligned, time-subdivision |
| symbolic-subdivision | time-aligned, time-subdivision, symbolic-subdivision |
| symbolic-association | time-aligned, time-subdivision, symbolic-subdivision |

#### III. 语言内容约束（FLEx 系）

| # | 规则 | 适用 contentType | 严格等级 | 描述 |
|---|------|-----------------|----------|------|
| L1 | `concatenation-morpheme-to-word` | morpheme tier → word tier | **warning** | 同一 word annotation 下所有 morpheme 的 `value` 按 ordinal 拼接（用分隔符 `-`）应等于 word 的 `value` |
| L2 | `concatenation-word-to-segment` | word tier → segment/utterance tier | **warning** | 同一 segment 下所有 word 的 `value` 按 ordinal 拼接（用空格）应等于 segment 的 `value` |
| L3 | `morpheme-gloss-one-to-one` | gloss tier (association of morpheme) | **warning** | 每个 morpheme annotation 恰好关联 1 个 gloss annotation（可为空字符串但不可缺失） |
| L4 | `word-pos-one-to-one` | pos tier (association of word) | **warning** | 若 POS tier 存在，每个 word annotation 至多关联 1 个 POS annotation |
| L5 | `lexicon-link-valid` | morpheme tier | **warning** | 若 morpheme annotation 关联了 `lexemeId`，该 lexeme 必须存在于 lexemes 集合 |
| L6 | `analysis-consistency` | word tier | **info** | 相同 `value` 的 word annotations 若已有 `isVerified=true` 的分析（morpheme 切分 + gloss），其他未审核实例应产生一致性提示 |

#### IV. 引用完整性

| # | 规则 | 适用范围 | 严格等级 | 描述 |
|---|------|----------|----------|------|
| R1 | `tier-parent-valid` | tier 定义 | **error** | `parentTierId` 指向同 `textId` 下已存在的 tier |
| R2 | `annotation-tier-valid` | annotation | **error** | `tierId` 指向已存在的 tier |
| R3 | `speaker-exists` | tier 定义 | **warning** | `participantId` 若非空，必须指向 speakers 集合中的记录 |
| R4 | `language-exists` | tier 定义 | **warning** | `languageId` 若非空，必须指向 languages 集合中的记录 |

### 严格等级说明

| 等级 | 含义 | 行为 |
|------|------|------|
| **error** | 违反则拒绝写入 | `saveTierAnnotationsBatch` 事务回滚 |
| **warning** | 违反则写入但附带提示 | 返回 violations 数组，UI 可显示黄色警告 |
| **info** | 仅供参考 | 不阻断、不警告，供分析页统计用 |

### 实现分期建议

| 阶段 | 规则 | 理由 |
|------|------|------|
| **MVP（现在做）** | T1, T2, T6, S1, S2, S3, S5, S6, R1, R2 | 结构正确性保底，10 条 error 级规则 |
| **标注页 v1** | T3, S4, L1, L2, L3, L5 | 开始做 IGT 编辑器时需要拼接/对齐检查 |
| **分析页** | T4, T5, L4, L6, R3, R4 | 数据质量审计、一致性分析 |

### 对数据结构的微调

上一轮提议的 `TierAnnotationDocType` 需要新增一个字段以支持 FLEx 的词典关联：

```typescript
interface TierAnnotationDocType {
  id: string;
  tierId: string;
  parentAnnotationId?: string;
  startTime?: number;
  endTime?: number;
  ordinal?: number;
  value: string;
  // 新增：FLEx 词典关联
  lexemeId?: string;            // 链接到 lexemes 集合（morpheme tier 用）
  senseIndex?: number;          // 对应 lexeme.senses 的索引
  speakerId?: string;
  ai_metadata?: AiMetadata;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}
```

`TierDefinitionDocType` 新增拼接分隔符配置（L1/L2 规则需要）：

```typescript
interface TierDefinitionDocType {
  // ...同前
  contentType: 'transcription' | 'translation' | 'gloss' | 'pos' | 'note' | 'custom';
  // 新增：拼接规则配置
  delimiter?: string;           // symbolic-subdivision 子拼接时用的分隔符
                                // morpheme tier: '-'，word tier: ' '，默认 ''
  // ...同前
}
```

---

这份规则清单覆盖了 ELAN 的 4 种 stereotype 约束 + FLEx 的 concatenation / lexicon-link / analysis-consistency 三大独有约束。
