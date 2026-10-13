---
title: 固定端口与来源：保证数据不会「看起来丢了」
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [017]
issue: https://github.com/Abe-Junwei/Jieyu/issues/273
---

# 固定端口与来源：保证数据不会「看起来丢了」

## Question

IndexedDB 数据绑定在来源（协议+主机+端口）上，端口一变或 localhost 与 127.0.0.1 混用，项目就像丢了。启动器固定哪个端口？端口被占用怎么办？是否在应用里显示当前来源并提示？
