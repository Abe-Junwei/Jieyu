---
description: "识别工作区 git 改动，按功能分组 commit 并推送。Use when: commit, push, 提交, 推送"
agent: "智能提交智能体"
argument-hint: "可选：排除路径、dry-run、限定范围，例如：排除 docs，先 dry-run 不推送"
tools: [execute, read, search, todo]
---

分析当前工作区的所有 git 改动，按功能/模块分组生成原子 commit，遵循项目 conventional commits 规范（中英双语），在用户确认后推送。

$input
