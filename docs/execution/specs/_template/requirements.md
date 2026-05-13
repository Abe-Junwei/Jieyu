---
title: <feature-slug> requirements
doc_type: execution-spec-requirements
status: draft
owner: <author>
last_reviewed: YYYY-MM-DD
source_of_truth: <feature-slug>-spec
---

# Requirements — <feature-slug>

> 上限：≤ 60 行。超过即说明你在写 design 而不是 requirements，把溢出内容挪到 [design.md](./design.md)。

## 1. What & Why

- **要做什么**（一句话）：…
- **为什么现在做**（业务/技术触发）：…
- **不做什么**（明确范围外）：…

## 2. 用户场景（≤ 3 条）

1. 角色 X 在场景 Y 下，期望行为 Z。
2. …

## 3. 验收标准（可测）

- [ ] 标准 1（可被 vitest / E2E 断言）
- [ ] 标准 2
- [ ] 性能 / 体积 / 安全约束（如有）

## 4. 受影响代码地图

> 这一节是 Explore 阶段的产出。

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 页面 / Orchestrator | `src/pages/…` | 新增 / 修改 / 仅装配 |
| Controller | `src/pages/useXxxController.ts` | 新增 / 修改 |
| Service | `src/services/…` | 新增 / 修改 |
| Hook | `src/hooks/…` | 新增 / 修改 |
| Schema / DB | `src/db/…` | 新增 / 迁移 |
| i18n | `src/i18n/dictKeys.ts`、`src/i18n/dictionaries/*` | 新键 |
| 测试 | `src/**/*.test.ts(x)` | 新增 / 修改 |

## 5. 已知风险与依赖

- 与现有约束的冲突点（编排层 / ReadyWorkspace / 双层边框 / hotspot ratchet 等）：…
- 上游依赖（其它 ADR / spec / external lib）：…
