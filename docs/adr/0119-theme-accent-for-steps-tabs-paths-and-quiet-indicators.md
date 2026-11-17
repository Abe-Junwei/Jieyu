---
title: ADR 0119 - 向导步骤、标签页、路径与轻提示接入主题色
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-17
source_of_truth: decision-record
depends_on:
  - ./0114-restrained-theme-accent-three-tier-scale.md
  - ./0118-pixso-is-the-design-draft-workspace.md
---

# ADR 0119：向导步骤、标签页、路径与轻提示接入主题色

## 背景

[ADR-0114](./0114-restrained-theme-accent-three-tier-scale.md) 把主题色分成三档：`--brand` 实心、`--brand-tint` 浅底、`--secondary` 文字与图标。它覆盖了左轨、开态控件、进度与滑块、工具切换和链接。

在 Pixso 里搭组件库（[ADR-0118](./0118-pixso-is-the-design-draft-workspace.md)）后，剩下的位置标记和进度类组件仍全是墨色，界面显得单调：

- 向导步骤和进度条讲的是同一件事，进度条是靛青，步骤却是墨圈。
- 标签页当前项和左轨当前项作用相同，都是标出当前位置，但一个是靛青、一个是墨线。
- 路径里的可点项就是链接，ADR-0114 已规定链接用 `--secondary`，但路径没写。

`DESIGN.md` 标签家族一节「靛青只给次要标记」这句写在 ADR-0114 之前，读起来像全局禁令，和 ADR-0114 冲突。

## 决定

局部补充 ADR-0114 第 1 条的适用范围，第 2 条不染色的边界不变：

1. **向导步骤**：已完成用 `--brand` 实心圈加 `--brand-on` 勾；当前步骤用 2px `--brand` 边加 `--secondary` 序号；未到保持灰边。有阻断项时当前步骤仍用错误边加「!」和数量。
2. **标签页当前项**：2px 下划线改用 `--brand`，文字仍是加粗的 `--fg`。
3. **路径**：可点的上级项用 `--secondary` 文字，悬停加下划线；末项（当前位置）仍是加粗 `--fg`，分隔符「/」仍是 `--muted`。
4. **轻提示**：空状态主图标和 16px 行内加载环用 `--secondary`。按钮内的 12px 加载环跟随按钮前景色，不改。
5. `DESIGN.md` 标签家族一节改为「在标签家族里，靛青只给次要标记」，限定范围，不再读成全局禁令。

对比度：`--brand` 下划线和步骤圈边对纸面亮 `7.90:1`、暗 `3.38:1`，满足非文字图形 3:1；`--secondary` 文字和图标亮 `9.59:1`、暗 `9.18:1`。

## 未选方案

- **计数徽标的「新」用主题色**：它表示状态，ADR-0114 不让主题色表示状态。
- **树行和列表行选中用主题色**：违反 ADR-0114 第 2 条，内容对象选中保持中性灰。
- **路径分隔符也染色**：分隔符不可点，染色会让人以为能点。

## 影响

- 更新 `DESIGN.md` 中标签家族、导航、树与路径、向导、反馈各节。
- Pixso「组件」页的向导步骤、标签页、路径、空状态、加载环组件同步。
- `design/jieyu-paper/preview/` 按 ADR-0118 将退役，不再同步。
