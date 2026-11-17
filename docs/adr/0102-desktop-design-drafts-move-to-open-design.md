---
title: ADR 0102 - 桌面设计稿改用 Open Design
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0101-desktop-visual-direction-reexplore-superdesign.md
---

# ADR 0102：桌面设计稿改用 Open Design

## 背景

用户在 2026-11-16 确认 Superdesign 不能继续用（生成额度无法购买）。前一天已在本机装上 Open Design 0.27.1，并用占位色出过一页转写稿。

## 决定

1. **设计稿只有一个来源：Open Design。** 替换 [ADR-0101](./0101-desktop-visual-direction-reexplore-superdesign.md) 第 1 条和第 6 条。Superdesign 上已有的方向稿改为历史参考，不再作为实现依据。
2. **ADR-0101 的其余决定不变。** 视觉方向仍重新探索；ADR-0099 的 R01–R12 仍要满足；`DESIGN.md` 仍是获批后的视觉权威；与风格无关的工程规则、探索顺序（约束 → 小范围探索 → 规范 → 全套方向稿 → 逐片精稿）和切片 1 精稿重新打开都保持。
3. **Open Design 写出的 HTML 只作参考，不进代码。** 稿中只用合成数据，不上传木雅语料。2026-11-16 的「解语转写磨合」是占位色试页，不是选定方向。
4. **窗口停在思考时，以项目目录里的 HTML 为准。** Open Design 可能在页面已经写完后仍不结束回合。

## 未选方案

- **继续用 Superdesign，由代理写 HTML 再导入：** 不花额度，但用户确认该产品不能用。
- **改用 Pixso：** 能在国内付费改图层，但设计稿来源会再换一次，和已经开始的 Open Design 项目分开。

## 影响

- 实施清单、账本和首发设计验收里「设计稿在 Superdesign」改为 Open Design。
- 约束仍写在 `.superdesign/design-system.md`，Open Design 的设计包从这里导入。
