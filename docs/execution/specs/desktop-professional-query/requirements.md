---
title: desktop-professional-query requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-professional-query-spec
---

# Requirements — desktop-professional-query（切片 4 门）

> Research／SDD 门：ADR-0099 R06–R07。字段筛选不得冒充专业查询。

## 1. What & Why

- **要做什么**：专业查询语言（词序／相邻／跨层／有界跨片段）+ 可视化与文本构建器对应 + 查询写入互斥。
- **为什么**：ADR-0099 首发阻断；4ws 切片 4。
- **不做什么**：不把现有 `corpus.query` 子串检索宣称专业查询；不在未定语法前改冻结格式。

## 2. 用户场景

1. 构建器与文本查询无损切换；不支持表达只读并定位错误。
2. 同稿件有界跨片段命中展示两段上下文并可回跳。
3. 查询执行与正文写入互斥；取消／崩溃后锁释放。

## 3. 验收标准（切片 4 时勾）

- [ ] 正式语法／算子文档与测试语料
- [ ] 跨层／有界跨段组合正确；过期结果不可用
- [ ] 锁粒度与取消路径有 Electron 证据

## 4. 代码地图（初稿）

| 类别 | 路径 |
| --- | --- |
| 现有基础检索 | `DesktopCorpusQueryPanel`／desktop corpus query |
| 浏览器语料页 | `/corpus` 工作集（非专业语法） |
| 设计样例 | Penpot 28／46／50 |
