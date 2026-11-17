---
title: ADR 0103 - 纸本田野笔记是唯一默认外观
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0101-desktop-visual-direction-reexplore-superdesign.md
  - ./0102-desktop-design-drafts-move-to-open-design.md
---

# ADR 0103：纸本田野笔记是唯一默认外观

## 背景

Open Design 项目「S1 方向 · 纸本田野笔记」的当前稿已被选为后续开发用的外观。用户要求把它做成默认，并去掉之前的多套配色。这替换 [ADR-0101](./0101-desktop-visual-direction-reexplore-superdesign.md) 第 3 条里「注册为新外观、不覆盖已有选择」的做法。

## 决定

1. **默认外观只有纸本田野笔记。** 亮色是白纸 `#FFFFFF`、书桌 `#FAFAFA`、墨色 `#111111`。暗色是夜间书桌 `#0C0C09`、纸页 `#161614`、暖白 `#F4F2EC`，单独设计，不是亮色反转。
2. **主操作、选中和焦点用墨色。** 靛青 `#312C85`（暗色 `#B6B2F2`）只给链接和次要标签。状态色用 Minimal 的成功 `#16A34A`、警告 `#D97706`、失败 `#DC2626`；暗色里失败文字用 `#F07171`，以保证正文对比度。
3. **字体以 Noto 为主。** 界面 Noto Sans / Noto Sans SC，衬线 Noto Serif / Noto Serif SC，时间码 Noto Sans Mono，IPA 先用 Noto Sans，缺字再回退 Charis SIL。字体随应用打包，不从网上加载。
4. **去掉多套配色和主题色。** 设置里只保留亮色、暗色、跟随系统。启动时清掉旧的 `jieyu-appearance` 和 `jieyu-theme-accent`。
5. **`DESIGN.md` 和 `src/styles/tokens.css` 记这套颜色。** ADR-0101 里与风格无关的工程规则仍然有效。全套方向稿和逐片精稿还没做完。

## 未选方案

- **再加一个可选外观，保留旧配色：** 用户要求后续开发只使用这一套。

## 影响

- 已保存的旧外观选择在下次启动后不再生效。
- 控件圆角改为 4px，菜单和对话框 8px。
