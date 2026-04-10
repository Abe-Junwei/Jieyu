---
name: failure-rootcause-consolidator
description: "Use when: 汇总 type/lint/test/build 失败并做根因归并，减少重复修复与误判。Trigger words: root cause clustering, failure dedup, error chain, first-failure analysis."
argument-hint: "输入失败来源（typecheck/lint/test/build）与范围，例如：仅本轮新增失败"
user-invocable: true
---

# Failure Rootcause Consolidator

## 目标
将多来源失败归并为“根因链”，先修主因再清连锁报错，避免重复劳动。

## 何时使用
- 同一轮出现大量错误，怀疑同源。
- 修了一个错误后，多个失败自动消失。
- 需要向用户汇报真正阻塞项，而不是海量表象错误。

## 输入
- 失败来源：typecheck、lint、test、build。
- 失败窗口：本轮新增、全量、或指定命令输出。
- 排查范围：相关文件集合。

## 执行步骤
1. 收集失败快照：每类命令保留首个失败与代表性栈。
2. 规范化错误签名：文件、符号、错误类型、触发链路。
3. 归并同源问题：
- 语法主因
- 类型主因
- 模块 mock/导入主因
- 构建配置或资源主因
4. 建立修复顺序：主因 -> 连锁 -> 回归。
5. 输出“根因链路图”与“最小修复计划”。

## 输出模板
- 根因总览：
  1. 主因 A：<描述> -> <证据>
  2. 主因 B：<描述> -> <证据>
- 连锁影响：
  1. <失败项> 由 <主因> 触发
- 修复顺序：
  1. <先修项>
  2. <后修项>
- 预期消除失败数：<估算>

## 质量门槛
- 禁止逐条孤立修复而不做归并。
- 每个“主因”必须有可验证证据。
- 修复后必须复跑以验证连锁消除是否符合预期。
