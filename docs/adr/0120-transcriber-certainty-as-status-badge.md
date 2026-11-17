---
title: ADR 0120 - 转写人确定度改用状态色圆形徽标
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-17
source_of_truth: decision-record
depends_on:
  - ./0111-icon-usage-and-tag-family.md
  - ./0118-pixso-is-the-design-draft-workspace.md
---

# ADR 0120：转写人确定度改用状态色圆形徽标

## 背景

[ADR-0111](./0111-icon-usage-and-tag-family.md) 第 3 条把转写人自标的确定度 ✓ ≈ ? 和 IGT、IPA、说话人字母并列为「语料字形」，不做图标。`DESIGN.md` 时间轴一节又规定它「全用墨色，靠字形区分」。

在 Pixso 里落稿后，裸字形的问题很明显：12px 的 ✓ ≈ ? 混在转写文字、行尾保存状态和片段角落里，看起来像一段正文，不像标记；三种字形笔画粗细不一，在浅底和选中底上都很难一眼分出来。产品侧 `timeline-annotation.css` 其实早就给三档配了成功、警告、危险色，和设计规范不一致。

确定度和 IGT、IPA、说话人字母不同。后者是语料内容本身，前者是转写人对自己工作的状态判断，更接近状态片和计数徽标。

## 决定

1. **确定度用 16px 圆形徽标，只放字形，不加文字。** 浅底加实色字形：确定 `--success-bg` 底、`--success-text` ✓；不确定 `--warn-bg` 底、`--warn-text` ≈；没听懂 `--danger-bg` 底、`--danger-text` ?。字形 11px 粗体，居中。徽标挂 `aria-label`（确定／不确定／没听懂），悬停显示同一文字。
2. **用在哪里：** 时间轴片段行尾角标、IGT 行尾、检索结果和图例。图例写成「徽标＋文字」。
3. **修订 ADR-0111 第 3 条：** 「不用图标」清单里去掉「确定度 ✓ ≈ ?」。IGT、IPA、说话人字母仍是语料字形，不变。
4. **修订 `DESIGN.md`：** 时间轴一节「全用墨色，靠字形区分」改为本条；标签与徽标一节增加确定度徽标。
5. Pixso「组件」页新增「确定度徽标 / CertaintyBadge」（`level=certain | uncertain | not-understood`），设计系统页的用例改为实例。

## 未选方案

- **墨色徽标、靠底色深浅区分**：守住 ADR-0111「不给分类配色」，但三档要靠灰度和字形一起辨认，仍然要细看。确定度本身就是状态，用状态色符合 ADR-0111「颜色只出现在状态上」的本意。
- **带文字的只读标签**（「✓ 确定」）：在 16px 的片段角落放不下，同一信息出现两种外观。
- **只给「没听懂」上色**：三档的视觉权重不一致，「不确定」会被看漏。

## 影响

- 更新 `DESIGN.md` 中图标用法、标签与徽标、时间轴三处。
- 产品 `timeline-annotation.css` 的确定度角标已是成功、警告、危险色。改为浅底圆形徽标，随时间轴页重设计一起做，本 ADR 不单独改产品代码。
- `design/jieyu-paper/preview/` 按 ADR-0118 将退役，不再同步。
