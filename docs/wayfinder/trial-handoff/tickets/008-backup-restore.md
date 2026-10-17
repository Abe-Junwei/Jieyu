---
title: 备份与恢复对非开发者的呈现
label: wayfinder:prototype
mode: HITL
status: open
assignee:
blocked_by: [025]
issue: https://github.com/Abe-Junwei/Jieyu/issues/258
---

# 备份与恢复对非开发者的呈现

## Question

已定（[ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md) 第 6 条）：桌面版每个项目每天自动存一份 JYM 快照，保留 3 份，外加格式升级前快照，都放 `userData/backups/<项目>/`，写入后读回校验；JYB 只在浏览器构建。剩下：试用者在哪看到这些快照、怎么从快照恢复、换电脑怎么迁（拷项目文件夹或导出 JYM），做粗略原型确认流程与文案。

2026-10-16 补（[ADR-0062](../../../adr/0062-desktop-storage-decisions-2026-10-16.md) 第 1 条）：将来换掉每日 JYM 的备份必须带音频字节，并先做一次「从备份恢复、能播放」的演练。演练通过前每日 JYM 不动，替换方案本身还没批准。这次演练也是 D14 冻结前的一项（[009](009-schema-freeze.md)）。

## Related

验证记录已从工作区移除。本单仍只定试用者的呈现与文案：在哪看到快照、怎么恢复、换电脑怎么迁。
