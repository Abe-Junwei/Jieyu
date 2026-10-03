---
title: lexicon-sense-citation requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-30
source_of_truth: lexicon-sense-citation-spec
depends_on:
  - ../lexicon-sense-examples/requirements.md
---

# Requirements — Lexicon sense citation

## 1. What & Why

- **要做什么**：义项可以引用语料里的一次出现。打开时读那句的转写和译文，不另存句子副本。
- **为什么现在做**：引用已经能从标注页写入，词典义项上还看不到，保存例证时还会把引用清掉。
- **不做什么**：不覆盖手写例证；不把句子正文抄进词条。

## 2. 用户场景（≤ 3 条）

1. 词条上能看到引用的句子，仍指向原来的 token。
2. 链接改挂后，引用标成失效，仍可删除。
3. 清空手写例证后再保存，引用还在。

## 3. 验收标准（可测）

- [x] 清空手写例证后 `occurrenceCitations` 仍指向原 token
- [x] 链接的义项变了，状态是 `broken`
- [x] 展示用的句子来自单元读模型，不写回词条

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| 保存 | `dmlexEntry.ts` | 保留引用 |
| 读 | `loadOccurrenceCitationDisplays.ts` | 现场读句子 |
| 页面 | `LexiconSenseList.tsx`、`LexiconPage.tsx` | 展示和删除 |

## 5. 已知风险与依赖

- 手写例证仍在义项 `examples`。引用在 `jieyu.occurrenceCitations`。
