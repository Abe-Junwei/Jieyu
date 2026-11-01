---
title: desktop-professional-query design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-professional-query-spec
depends_on:
  - ./requirements.md
---

# Design — desktop-professional-query（Research 门）

## 1. 成熟方案扫描 / Research

- 仓库既有：桌面基础 `corpus.query`（子串／分页／定位）、浏览器 corpus 工作集、AI 侧 concordance 工具（flag 关，非产品查询 UI）。
- 同类产品：ELAN Search、FLEx／FieldWorks corpus search、CorpusWorkBench／CQP、ANNIS — 常见能力：节点顺序、间隔、层约束、命中上下文。
- Best practice：文本语法与可视化构建器同源 AST；写入互斥用显式锁／世代号；取消可观察（ADR-0099 R07）。
- 反模式：用字段筛选或 KWIC 工具冒充专业查询交付；无锁并发写导致脏读。
- 坑：语法未定前勿改 schema；跨片段边界语义必须有界；结果定位依赖层／语段 id 稳定。
- **决定：自研语法 + 适配现有命中定位** — 不引入重型外部检索引擎作首发依赖；语法／算子须在切片 4 前另轮 Research 定稿（可对照 CQP／ANNIS 操作子集）。本文件先锁范围与反模式。

## 2. 架构选择

- 查询只读路径与转写写路径分锁；UI 构建器与 parser 共享 AST。
- 拒绝：在 SQLite 上直接嵌任意正则用户串无沙箱。

## 3. 落位（开工时细化）

| 文件 | 职责 |
| --- | --- |
| query AST／parser | 语法真源 |
| 桌面执行器 | 只读扫描 + 锁 |
| 语料工作区 UI | 构建器／文本／结果 |

## 4. ADR

- ADR-0099 R06–R07；语法稳定后可另开 ADR 冻结算子表。
