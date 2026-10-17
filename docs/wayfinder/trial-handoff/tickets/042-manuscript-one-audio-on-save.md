---
title: 浏览器保存路径：一份文稿只挂一条录音，不存跨文稿关系
label: wayfinder:task
mode: HITL
status: open
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/327
---

# 浏览器保存路径：一份文稿只挂一条录音，不存跨文稿关系

## Question

[ADR-0061](../../../adr/0061-jyd-manuscript-file-audio-stays-plain.md) 与 [ADR-0062](../../../adr/0062-desktop-storage-decisions-2026-10-16.md) 第 4 条已经生效：一份文稿同时只挂一条录音，换录音就是替换；所有 `unit_relations`（含父子链接）两端都必须在同一份文稿里。检查函数已有（`src/db/projectFiles/manuscriptAudio.ts`、`manuscriptParents.ts`），浏览器现有的保存路径没有接，界面现在仍能给一份文稿挂第二条录音。

要做：

- 给文稿挂录音的写操作走存储端口（[ADR-0048](../../../adr/0048-storage-port.md)）。已有录音时是替换，不是追加，替换前提示。
- 新建或修改关系时，两端不在同一份文稿就不写，并说明原因。
- 已经挂着多条录音的旧文稿：不删、不剥离，照常能打开和编辑；只列出来，留到迁移时拆分（ADR-0062 第 5 条，[044](044-browser-library-to-desktop.md)）。
- 文案走字典。替换提示的措辞由用户确认。

验收：写入后读回；挂第二条录音后文稿只剩一条；跨文稿关系写不进去；旧的多录音文稿打开、编辑、保存后内容不丢；定向 vitest 与 `npm run test:e2e:chromium`。
