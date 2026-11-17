---
title: ADR 0107 - 动效时长、紧凑高度、时间轴选中底与 ⌘M
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0104-type-space-shadow-and-ink-only-series.md
  - ./0106-design-system-package-lives-in-repo.md
---

# ADR 0107：动效时长、紧凑高度、时间轴选中底与 ⌘M

## 背景

[ADR-0106](./0106-design-system-package-lives-in-repo.md) 改为从代码 token 生成设计包后，代码与 `DESIGN.md` 的几处出入露了出来：

- 动效：代码 `--duration-fast` / `--duration-normal` 是 200 / 300ms，`DESIGN.md` 写悬停 120–180ms、浮层 160–220ms。
- 紧凑高度：`DESIGN.md` 写 28px，代码 `--btn-h-sm` 是 28px，`--btn-h-compact` / `--input-h-compact` 却是 30px。
- 时间轴选中底 `--timeline-selection-bg` 与悬停底同为 tint，选中只靠左侧墨条区分。
- ⌘M 在 `KeybindingService` 里是「合并下一个」，Electron 默认菜单把它给「最小化」，菜单快捷键先于页面拿到按键。
- ⌘⇧N 在键位表里叫「切换备注面板」，右键菜单叫「添加备注」，两者打开的是同一个当前句段备注浮窗。

## 决定

1. **动效以 `DESIGN.md` 为准**：`--duration-fast` 160ms（悬停、小控件），`--duration-normal` 200ms（浮层进出）。
2. **紧凑只有 28px**：`--btn-h-compact`、`--input-h-compact` 都指向 `--btn-h-sm`。`--input-h-sm`（30px）不动。
3. **选中比悬停深一档**：`--timeline-selection-bg: color-mix(in srgb, var(--text-primary) 8%, var(--surface-panel))`，亮色 #ececec、暗色 #282825；悬停仍用 tint，左侧墨条保留。
4. **⌘M 归合并**：桌面端按 Electron 默认菜单结构重建应用菜单，窗口菜单的「最小化」改为不带快捷键的普通项，其余菜单不变（默认菜单里指向 Electron 官网的「帮助」不再保留）。
5. **⌘⇧N 保持一个动作**：打开或关闭当前句段的备注浮窗；右键「添加备注」继续标 ⌘⇧N。不新增 ⌥⌘N。
6. **语谱图色阶**：默认墨色单色阶，设置里可切换为 viridis，不提供彩虹色阶。本条只进规范；实现另起，先做调研。

## 未选方案

- **按代码改文档（200 / 300ms）**：浮层 300ms 在逐句校对时显拖沓，超出常见桌面工具的过渡范围。
- **紧凑保留 28 / 30 两档**：两档相差 2px，肉眼难分，只增加选择成本。
- **选中用靛青浅底**：靛青只作次要标记（ADR-0103），用作选中会和链接、次要标签混淆。
- **「合并下一个」改 ⌃⌘M**：合并是高频动作，⌘M 已有肌肉记忆；最小化在转写工作中很少用快捷键。
- **⌘⇧N 拆成「添加」和「开关」两个键**：两者打开的是同一个浮窗，拆开只多一个要记的键。

## 影响

- 所有用 `--duration-fast` / `--duration-normal` 的过渡变快；用 `--btn-h-compact` / `--input-h-compact` 的控件矮 2px。
- 桌面端 ⌘M 不再最小化窗口。
- 改值后运行 `npm run build:od-tokens`，设计包同步。
