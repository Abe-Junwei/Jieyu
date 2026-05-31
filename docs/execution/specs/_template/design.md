---
title: <feature-slug> design
doc_type: execution-spec-design
status: draft
owner: <author>
last_reviewed: YYYY-MM-DD
source_of_truth: <feature-slug>-spec
depends_on:
  - ./requirements.md
---

# Design — <feature-slug>

> 上限：≤ 100 行。超过即说明你在写实现细节而不是 design，把溢出挪到代码注释或单独 ADR。

## 1. 成熟方案扫描 / Research（承接工作流 §5.1.5）

- 仓库既有最相似的模式：…（具体文件路径）
- 同类产品 / 标杆实现：…（业内产品 / 知名开源 / 框架原生模式怎么做）
- 业内 best practice / 事实标准 / 规范：…（库 / 协议 / W3C / ISO / 领域规范）
- 公认不可行 / 反模式 / 已弃用方案：…（以及"为什么不行"）
- 潜在的坑：…（边界、性能 / 兼容 / 隐私、维护成本、依赖许可与体积）
- 决定：**复用 / 适配 / 自研** —— 理由 + 已知坑规避：…

## 2. 架构选择

- 落位类别：`state / derived / effect / actions / routing`（可多选并说明各占多少）
- 关键 trade-off：
  - 方案 A vs B：选 A 因为 …
  - 拒绝的方案：…

## 3. 落位清单（与 requirements §4 对应）

| 文件 | 职责（一句话） | 复杂度估计（行 / hooks） |
| --- | --- | --- |
| `src/pages/useXxxController.ts` | … | < 200 / < 8 hooks |
| `src/services/XxxService.ts` | … | < 300 |
| `src/hooks/useYyy.ts` | … | < 150 |

约束自查：
- [ ] 单 hook 行数 < 300，`useEffect/useMemo/useCallback` 总数 < 12
- [ ] 编排层只组装 / 透传 / 绑事件
- [ ] 不引入 `src/features/…`
- [ ] 面板 CSS 双层边框规则（如涉及 UI）

## 4. ADR 引用

- 相关 ADR：[`docs/adr/NNNN-...`](../../../adr/)
- 是否需要新建 ADR？（**仅 hard-to-reverse 决策**，例如选择持久化技术、协议、对外接口）：是 / 否

## 5. Feature flag（如启用）

- Flag 名：`featureXxx`
- 默认值：`false`
- Rollout 计划：合并 → 自用 X 周 → 切默认 `true` → 后续 cycle 清理 flag

## 6. 失败模式 / 兼容性

- 旧用户路径：…
- 数据迁移（如有）：…
- 回滚预案：…

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run <path>` | all pass |
| 结构守卫 | `npm run check:architecture-guard` | OK |
| E2E（如适用） | `npm run test:e2e:chromium -- <spec>` | green |
| Agent evals（涉 AI） | `npm run check:agent-evals:smoke` | OK |
