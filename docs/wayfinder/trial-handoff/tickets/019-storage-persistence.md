---
title: 浏览器数据丢失风险与持久化策略
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [018]
issue: https://github.com/Abe-Junwei/Jieyu/issues/269
---

# 浏览器数据丢失风险与持久化策略

## Question

数据全在本地网址下的 IndexedDB，浏览器清缓存或自动清除会丢项目。是否在首次使用时申请 navigator.storage.persist()、是否做成可安装的 PWA、是否强制定期导出备份（与 008 相关）？对试用者怎么讲清这个风险？
