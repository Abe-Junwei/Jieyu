---
title: desktop-domain-write-boundaries design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-26
source_of_truth: desktop-domain-write-boundaries-spec
depends_on:
  - ./requirements.md
---

# Design — 写入边界与待确认取舍

## 1. 成熟方案扫描 / Research

- [SQLite ATTACH](https://www.sqlite.org/lang_attach.html)：一定条件下可跨附加库原子提交。因此问题是当前两个独立连接分次提交，不能写成“两文件必然不能原子”。本片不引入 ATTACH，以免重新绑定项目与本机库的生命周期。
- [SQLite 事务](https://www.sqlite.org/lang_transaction.html)：事务保护数据库写入；普通文件发布、删除与应用层后续诊断需要独立失败边界。
- 仓库已有 better-sqlite3 同步事务、项目内 provenance、主进程文件操作与 R1 合成用例；复用这些边界，不新增 ORM、分布式事务或通用事件框架。
- 反模式：保存正文后第二次调用清图、文件删完再试图回滚、诊断失败报告为业务未保存、用备注目标枚举代替真实入口清单。无新增依赖。

## 2. 诊断补交（已由 ADR-0091 收口）

项目内解释这次写入所必需的记录仍与内容同事务，失败一起回滚。本机技术日志另有待补交记录：内容提交后诊断库失败，显示日志待补交，只重试日志，不把内容说成未保存，也不显示全部完成。相同身份不同载荷不覆盖。字段冲突按修订号，不用整行旧快照。响应丢失仍不自动重试写入；可查询的接受或提交事实按 ADR-0091。密钥和窗口状态继续留在 userData。对照见 [后续里程碑规格](../remaining-milestones-contracts/design.md)。

## 3. 备注目标（去向已由 ADR-0091 确认）

身份依据 `src/db/types.ts` 和 `src/db/noteTextId.ts`。生产构造点、没有按钮的四类，以及当前 `JieyuNote` 装不下的字段，见 [后续里程碑规格](../remaining-milestones-contracts/design.md) 第 2 节。词条和义项只进 `jieyu_json`。译文评论不写入译文正文。`text` 默认是项目备注。单元格保留 unit、layer 和 timeline/waveform。当前 `notes` 的单字符串 `body` 不是最终载体。分析恢复不覆盖后来的备注编辑。

## 4. 正文、代际与模块职责

units.updateText(unitId,text,预期凭据)：事务内读取文稿/语段→核对可写和代际/指纹→正文确有变化时留完整快照→改正文、清当前图、卸下投影/关联、推进语段分析代际→读回→提交。快照与卸下语义按 ADR-0089；无变化的重复保存不凭空推进代际。
analysis.apply/restore 与 updateText 共用主进程内部逻辑和同一连接，不通过客户端互调来拼事务。manuscripts 的代际当前值只由文稿生命周期写入，units 的分析代际由对应原子业务推进；模块所有权不拆开事务。建议/任务保存旧凭据，不能写回时换成最新值。
将 manuscripts.generation、units.analysis_generation 作为落位草案，字段名与逐列约束在 R6 定稿；候选/任务只复制生成时凭据，不充当当前计数器。两个计数不倒退，已接受建议不设“一语段仅一条 accepted”的唯一索引。

## 5. 附件与宿主失败边界

R5 必须先给出文件发布/清除状态机：准备文件→原子写登记/关联→文件收尾；最后引用解除后即使登记行要删除，也必须有仍可恢复的文件身份和操作依据。其载体待 R5，不在这里发明表。数据库事务不包普通文件 I/O；回滚、崩溃结果未知、重试、新关联及路径被替换都要验证。不自动套录音保留期，不因“ref_count=0”声称磁盘已删除。
M2/M3：probeStore 只对独立临时夹具开放；选择/打开项目后旧 skeleton:write-probe 不能修改它。这条已经接到主进程。对合法库、错误标识文件、空文件的拒绝路径验证字节不变，不为探针补 application_id 伪装新格式；这不是新格式兼容策略。
M4 时间片：替换首次声学绑定改语段时间的旧路径；offset/scale 更新后文献秒保持原值，播放器及转写结果换算符合公式。对应旧测试必须在接替时改为新业务结果，而不是直接复制断言。

## 6. 验证与实施落位

后续代码落位：src/db/desktop/units.ts、analysis.ts、manuscripts.ts、notes.ts、lexicon.ts；宿主为 electron/main.ts 与 src/desktop/skeleton/probeStore.ts。都是未来实施路径，本片不改这些文件。
定向验收见 requirements §4；真实临时库关闭重开与失败注入。后续实现跑 typecheck、定向 vitest、架构/workflow/agent-evals；宿主/屏幕接替加 Electron 与仍有效 Chromium 门槛。本轮只修改文档，旧路径回归只能佐证基线，不能算上述行为已实现。
