---
title: desktop-project-deletion design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-25
source_of_truth: desktop-project-deletion-spec
depends_on:
  - ./requirements.md
---

# Design — desktop-project-deletion

## 1. Research

- 复用单库同步业务事务、SQLite 外键及已有桌面主进程，不复用扫描 .jyd 的删除协议。
- [SQLite 原子提交](https://www.sqlite.org/atomiccommit.html) 约束数据库修改，不把 OS 垃圾箱当作同一事务资源。
- [Electron shell.trashItem](https://www.electronjs.org/docs/latest/api/shell#shelltrashitempath) 是主进程文件移走 API，完成 Promise 不提供可恢复的垃圾箱句柄；用它适配磁盘操作，不造跨平台垃圾箱实现。
- 旧 sqliteRemoveEmptyRecording.ts 写占位 media id、跨库提交，不可直接用作新删除；其“不删原件”测试意图可保留。
- 无新增依赖；复用平台 API 和现有测试工具。反模式是先删音频、只查 deleted 布尔值、用文件缺失当成功，或按后台通知投递启动宽限期。

## 2. 结构提案（实施前核对）

- effect/actions 在数据库领域与主进程服务，derived 是清除资格；界面仅状态展示/事件装配。
- manuscripts/media 各持久保存删除时点、不得早于的清除期限、本周期提醒展示时点；恢复清掉删除周期状态，再删除开启新周期。
- 文稿持久写入代际，任务启动携带该代际；每次写入在同事务检查有效性。删除后即使恢复旧任务也不再匹配；同步编辑与后台结果不能绕过校验。
- 以最小项目内清除操作记录保存操作 id、目标身份/路径、意图/已确认/失败/未知状态；字段和枚举在该片正式设计时写入 schema.ts，不放 userData/settings_json。
- 上述是必要状态提案，不代表已实现或已最终确定具体列名；实际 DDL 前需审阅 API、写入入口及受影响业务，不提前为 M1 增加字段。
- 已删除列表有专用读接口；普通领域查询默认只读有效对象，不能靠每个 UI 记得手动加过滤。
- 标记删除时同库一次事务改全部目标；前置保存/任务停止按 ADR 保留已完成效果，不声明跨整个 UI 流程回滚。

## 3. 清除与恢复

- 最早清除 = max(保留期限, 本周期提醒实际展示时点+7 天)，未展示不具备资格；时间判定支持受控测试时钟。
- 删除录音时各文稿清除期限取原期限与本次删除+90 天的较晚者；本周期提醒不足以覆盖新窗口时仍需满足新的清除资格。
- 恢复一份文稿在同事务取消录音待清除状态；其他文稿不变。清除与恢复并发时重读有效状态，不能用提前缓存的候选列表直接清除。
- 文稿清除只清自身标注/备注；共享说话人、录音等不级联。录音无任何文稿引用且自身期限满足才移走音频。
- trash 前记录意图并核查文件身份，成功后事务清理 media/来源关联；崩溃未知时进入需处理状态，不自动按路径重试移走另一个文件。
- 包恢复保留删除状态但使旧提醒不再授权立即清除；重新实际展示后至少留 7 天。旧备份副本不追删。

## 4. 四片与落位

- D1：manuscripts/media 状态、普通读过滤、已删除列表、删除/恢复 UI/字典；引入 D2 必需写门禁后才可对用户开放。
- D2：保存/任务停止协调、持久写入代际、迟到结果拒绝；复用现有任务入口，不能读运行时私有字段。
- D3：提醒/受控期限/文稿清除/包保留与恢复；数据模型和打包服务同步验收。
- D4：主进程垃圾箱操作记录、故障收尾、来源解除、新 id 登记和重复候选提示。
- D1/D2 属同一安全发布边界，不把可恢复状态 UI 提前接给仍可后台写的文稿。后续每片补具体文件清单后才进入实施。

## 5. 验证

- 表驱动场景覆盖 90 天前后、未看提醒、迟看/重开、重新删除、关联期限不同、恢复一份/整录音、导入过期备份。
- SQLite 真实临时库：多目标状态写入/清除中途失败，关闭全部连接重开核对；清除并发恢复重查状态。
- 可控任务：保存失败、停止失败、删除后迟到、恢复后迟到、重新启动合法任务；原内容与停止副作用按规则断言。
- 磁盘适配故障注入：trash 失败、成功后回写失败、未知结果、同路径替换文件；Electron 真实临时文件送垃圾箱单独验收。
- typecheck、定向 vitest、architecture-guard、workflow；触界面/ReadyWorkspace 跑 Chromium/Electron 相应门槛，触 AI 跑 agent-evals:full；docs-governance。
