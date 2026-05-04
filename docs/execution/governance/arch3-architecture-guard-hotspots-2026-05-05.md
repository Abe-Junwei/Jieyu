---
title: ARCH-3 architecture-guard 热点文件回收计划（2026-05-05）
doc_type: execution-governance-arch-decision
status: active
owner: repo
last_reviewed: 2026-05-05
source_of_truth: arch3-architecture-hotspots
---

# ARCH-3：`check:architecture-guard` 热点文件回收计划

`npm run check:architecture-guard` 对接近 **硬上限** 的文件给出 **WARN hotspot**（典型为行数、`useMemo` / `useCallback` 声明数）。此类文件**禁止**在无拆分设计的情况下继续堆功能；回收应 **单独立迭代 / PR**，与 F4 等功能交付解耦。

## 当前已登记热点（来自 2026-05-05 一次全量守卫输出；以脚本最新输出为准）

| 区域 | 文件 | 风险摘要 | 回收方向（草案） |
| --- | --- | --- | --- |
| UI | `src/components/ai/AiChatCard.tsx` | 行数与 `useMemo` 接近上限 | 按「编排 vs 渲染」拆子组件或抽只读展示块；新需求默认落子文件 |
| 页面 | `src/pages/TranscriptionPage.ReadyWorkspace.tsx` | `useCallback` 数量接近上限 | 继续按现有 controller 模式下沉回调，避免在编排层新增成簇业务 |
| 页面 | `src/pages/LanguageMetadataAdministrativeDivisionPicker.tsx` | 行数接近上限 | 表单分段 / 子面板或 hook 拆分（避免薄 hook 平移） |
| UI | `src/components/SettingsModal.tsx` | 行数接近上限 | 按设置 Tab 拆文件或抽 settings section 组件 |
| 服务 | `src/services/LinguisticService.ts` | 行数接近上限 | 按领域子模块继续纵向切分（与现有 tiers/constraints 一致） |

## 已交付小步（减热点文件行数）

- **2026-05-05**：将 `AiChatCard` 内纯函数 `buildPinnedSummary` 与空数组常量迁至 `aiChatCardUtils.ts`（`buildPinnedSummary` / `AI_CHAT_CARD_EMPTY_STRING_ARRAY`），为后续「composer 子组件」拆分占位，**不改变运行时行为**。

## 守卫与节奏

- 命令：`npm run check:architecture-guard`（CI 子集见 `check:architecture-guard:core`）。
- **同一热点文件**若需加功能：优先在同一 PR 内做 **拆分或降复杂度**；若必须例外，在 PR 描述中写明 **例外原因 + 回收 issue/计划链接**，并避免继续推高计数。
- 与整改主清单对账时，可将本 ARCH-3 作为 **「热点回收」** 主题单列，避免与 F4 / 工具治理 PR 混写。

## 与未落地台账的关系

- 高层台账仍见 [未落地项汇总-2026-04-24.md](./未落地项汇总-2026-04-24.md)（例如 **ARCH-7** 转写编排）；本 ARCH-3 侧重 **architecture-guard 数值热点**，二者可并行跟踪、合并关闭时在两边同步更新 `last_reviewed`。
