---
title: desktop-domain-write-boundaries design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-25
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

## 2. 审计取舍草案（未接受，不改变当前承诺）

拟题：项目业务必需记录与本机运行诊断分开。ADR-0085 的回滚承诺与索引的 userData 审计位置目前冲突；下面只是建议，不能先按较宽松语义写代码。

| 记录类别 | 建议落位与成功语义 | 实施前核对 |
| --- | --- | --- |
| 缺失就不能解释或验证这次语言写入的业务记录 | project.sqlite，与业务同事务；失败整次回滚。优先使用已定来源、运行、候选/快照载体 | 按实际操作列必需字段，最小内容；不能借此恢复 ADR-0085 已排除的通用工具审计表 |
| 本机运行诊断／非业务必需审计 | 建议提交后写 userData；失败单独提示/记录诊断异常，业务保持成功 | 逐调用方核对是否依赖审计作为成功条件；决定可丢还是须可重试，不能默认保证送达 |
| IPC 提交后响应丢失 | 结果未知，不是业务回滚；不自动重试 | 不能借诊断方案把结果未知改成成功，也不能因未收到响应重复应用 |

需新 ADR 明确收窄哪些失败承诺后才能实施。没有要求诊断必达时不预建 outbox；若存在必达需求，再定持久交付依据。密钥和窗口状态继续 userData，不与此混为同一类数据。

## 3. 备注目标清单（现有解析与能力落点，非已冻结 DDL）

现有身份依据 `src/db/types.ts`、`src/db/noteTextId.ts`。生产入口见 `src/hooks/notes/useNotes.ts`、`useNoteHandlers.ts`、`src/hooks/importExport/useImportExport.importHandlers.ts`、`src/services/FlexService.ts`；按行逐项补对应入口证据，不能将解析支持冒充 UI 已可达。

| 旧 targetType | 实际身份 | 接替方向／开工门禁 |
| --- | --- | --- |
| unit | layer_units.id | notes→units；删除/卸下/恢复按 ADR-0087/0089 |
| token | unit_tokens.id，可能带 parentTargetId | notes→稳定 token id；不以数组位置认回 |
| morpheme | unit_morphemes.id | notes→稳定 morpheme id；跨度与词项重建不能换目标 |
| lexeme | lexemes.id | 按 ADR-0088 承接 jieyu_json；保留多语正文、分类、来源、时间的具体编码待词典片核对 |
| sense | 义项 id + parentTargetId 指向词条 | jieyu_json；复合身份核对，不能只凭全库 sense 字符串匹配 |
| translation | layer_unit_contents.id | 译文正文在 unit_texts(role=translation)；对该行的评论另存备注。是否扩 notes 目标/采用专门关联待决定，不能改指 unit 后丢失目标层/角色 |
| text | 项目 texts.id；导入确有该类备注 | 项目级备注，不默认等同于一份 manuscript；项目/文稿范围按导入含义拆清后决定落点，不塞 settings_json |
| annotation | tier_annotations.id 或解析器支持的复合单元格 id | 先核对调用方与语义；对应内容行/节点或已退出能力，逐项决定，不从枚举直接删除 |
| tier_annotation | tier_annotations.id 或 unitId::layerId[::@waveform] | useNoteHandlers 有单元格入口；需保留 unit、layer、scope 的定位。映射到内容行还是复合目标待决定，不能粗化成整层备注 |

新 notes 的 layer 目标与旧单元格目标不同，不能因旧枚举没有 layer 就取消新决定。每类都列保留/取消依据、实际读写入口、目标身份、必填数据、查询、脱离关联、软删/永久清除和恢复行为后，才写 notes.ts。现有多语 content/category/provenance/时间及 targetIndex/parentTargetId 等定位数据不得因表清单省略而丢弃。

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
