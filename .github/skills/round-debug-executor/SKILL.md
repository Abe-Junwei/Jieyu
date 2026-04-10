---
name: round-debug-executor
description: "Use when: 对刚落地功能按 0-6 轮执行排错，默认自动修复，逐轮给出证据与结论。Trigger words: round-based debugging, phased triage, auto-fix loop, release triage."
argument-hint: "输入范围与模式，例如：范围 origin/main...HEAD，自动修复，目标无 P0/P1"
user-invocable: true
---

# Round Debug Executor

## 目标
把排错过程标准化为固定轮次，避免混轮处理，并在每轮完成“检查 -> 定位 -> 修复 -> 复验 -> 结论”。

## 默认策略
- 默认模式：自动修复。
- 默认范围：改动文件 + 一层依赖相邻文件。
- 默认目标：仅排相关代码，不做无证据扩圈。

## 轮次定义
1. 轮次 0：对话回顾、范围建档、风险地图。
2. 轮次 1：语法与类型。
3. 轮次 2：静态治理与边界守卫。
4. 轮次 3：测试回归。
5. 轮次 4：构建与运行时冒烟。
6. 轮次 5：专项多维排错（i18n、a11y、性能、安全、文档治理）。
7. 轮次 6：最终逐行全面排错收口。

## 执行步骤
1. 先调用范围技能与回顾技能，确定输入范围和功能理解。
2. 逐轮执行，不允许跨轮提前修后续问题。
3. 每轮优先修复 P0/P1，再决定是否处理 P2。
4. 每次修复后复跑最小必要命令，避免盲目全量重跑。
5. 每轮输出通过/阻塞结论，再进入下一轮。

## 建议命令集合（按仓库脚本择优）
- 类型：npm run typecheck
- 静态守卫：npm run check:architecture-guard
- CSS/治理：npm run check:css-architecture
- i18n：npm run check:i18n-hardcoded:guard
- 测试：npx vitest run <related tests>
- 构建：npm run build

## 每轮输出模板
### 轮次 N：<主题>
- 目标：<本轮目标>
- 输入范围：<文件/目录>
- 执行命令：
  1. <命令>
  2. <命令>
- 发现：
  1. [P0/P1/P2] <问题> -> <文件:行号>
- 修复：
  1. <改动> -> <文件:行号>
- 复验：<通过/未通过 + 证据>
- 结论：<下一步>

## 质量门槛
- 一轮未闭环不得切轮。
- 不得把“未来建议”当成“当前轮结论”。
- 每条结论必须有命令与文件证据。
