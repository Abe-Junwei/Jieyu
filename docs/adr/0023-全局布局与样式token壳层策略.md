---
title: ADR 0023 — 全局布局与样式 token 壳层策略
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-26
source_of_truth: architecture-decision
---

# ADR-0023：全局布局与样式 token 壳层策略

## 背景

桌面端在语言资产、正字法管理/桥接、大表单与弹层上并存多套「间距 / 圆角 / 阴影 / 控制件基类」，带来视觉漂移与维护成本。需在不改变产品能力的前提下，约定唯一心智与可验证的收束方向。

## 决策

1. **圆角（拍板 A1）**  
   「卡片/气泡/列表块」等形状语言优先使用 `tokens.css` 中既有的 `--radius-*` 阶梯，不新增「卡片专档」token；将历史上大量 `18px` 等硬编码收束为 `var(--radius-2xl)` 等，接受与原稿约 2px 级差。外壳级大圆角与布局节奏强相关时，可用 `--space-6`（24px）与间距阶梯一致，避免无文档魔数。

2. **节间距（拍板 B1）**  
   大节/对话体纵向节奏以 `--la-section-gap`（继承 `--space-stack-page` 等）为真源；折叠小节/表单行内节奏以 `--space-stack-section` / `--space-row-gap` 为真源。实现上优先 `var(--space-stack-section)` 等语义名，减少裸 `12px`/`10px` 与 token 并列表述。

3. **控制件双轨（拍板 C1）**  
   在 `.la-shell` 及同一语言资产合约面内，**以 `control-primitives`（`.input` / `.btn`）+ `language-asset-section-contract` 为壳内主入口**；`panel-input` / `panel-button` 用于无该合约的独立面板。新代码不新增第三条并列体系。

4. **高密度区（拍板 D1）**  
   转写顶栏、波形、聊天/host 等高密度区域**纳入**与全局 `--shadow-*` 的对齐与重复长阴影收束，与表单壳层同一轮治理，但以「 elevation 可映射处优先替换、语义色/内阴影保留」为原则，避免一次性破坏波形与焦点态语义。

5. **文档**  
   落地方案与阶段门禁见 `docs/execution/plans/全局布局与样式token收敛整改方案-2026-04-26.md`。

6. **Phase E（类名）**  
   语言资产工作区内「二级小节」标题栈与说明：使用 `panel-section__copy`、`panel-title-secondary`、以及 `panel-subsection__description`（见 `panel-primitives.css`），**不再**使用 `lm-subgroup-*` 前缀，便于与全站 `panel-*` 可发现性一致。

## 影响

- 后续样式 PR 应优先用 token 与合约层选择器，避免在 LM/OM/OB 三处重复覆盖；新增 shell 内控件走 `.input`/`.btn`。
- 视觉可能因圆角/阴影与 token 映射出现轻微差分，E2E 与手工 spot-check 以「无功能回归、整体一致」为准。

## 被放弃的备选

- 新增 `--radius-card: 18px` 与现有阶梯并列（A2）：当前采用 A1，降低命名膨胀。
- 顶栏/波形排除在壳层方案外（D2）：拍板为 D1，与全局阴影一并收束。

## 后续回顾点

- `check:css-debt` / `build:guard` 是否因预算需周期性上调；若「例外」积累，再评估是否增加语义别名或 ADR 修订。
