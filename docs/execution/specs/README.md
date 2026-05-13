---
title: execution/specs 文档索引
doc_type: execution-specs-index
status: active
owner: repo
last_reviewed: 2026-05-13
source_of_truth: execution-specs-index
---

# execution/specs

每个 feature-slug 子目录承载一个**中等及以上复杂度任务**的 Spec-Driven Development 三件套：

```
docs/execution/specs/
├── _template/               # 三件套模板（不要直接改名提交）
│   ├── requirements.md      # ≤ 60 行：What & Why & 受影响代码地图
│   ├── design.md            # ≤ 100 行：How & 落位 + trade-off + ADR 引用
│   └── tasks.md             # ≤ 60 行：可勾选 todo + 验证方式
└── <feature-slug>/          # 实际 feature 目录，由作者复制 _template/ 后改名
    ├── requirements.md
    ├── design.md
    └── tasks.md
```

## 触发条件（与 [copilot-instructions.md](../../../copilot-instructions.md) §5.2.1 一致）

满足任一即触发：

- ≥ 1 新 controller hook
- ≥ 1 新 service 模块
- 跨 ≥ 3 个 controller 的改动
- 触及 ReadyWorkspace 装配 / 时间轴单 host 入口
- 触及持久化 schema / 迁移
- 新增 feature flag

未触发的中等改动允许直接以 Plan 文本说明（不强制建 specs/ 目录）。

## 与 [docs/execution/plans/](../plans/) 的关系

- `plans/`：宏观规划、多 milestone 路线图。
- `specs/`：per-feature 三件套，颗粒度细到具体落位文件与验证命令。
- 一份 plan 可分解为多份 spec。
- spec 完成后 frontmatter `status: completed` 并保留作历史证据；不强制移动到 archive。
