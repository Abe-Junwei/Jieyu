---
title: desktop-project-sqlite tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-25
source_of_truth: desktop-project-sqlite-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — desktop-project-sqlite（M1）

## 开始

- [ ] 按单库计划 M1-S1→S2→S3→S4 领取实施；本轮路线图/issue 同步不等于已开始写代码。
- [ ] 核对 dirty 文件归属；不删旧实现、不重跑已停评审、不读真实语料。

## S1：新库结构

- [ ] schema.ts 定义 ADR 全表集，类型就近定义，不加正文包装层。
- [ ] 以最小定向测试验证本闭环的必填、枚举、唯一、外键及时间约束 → npx vitest run src/db/desktop --maxWorkers=1。
- [ ] typecheck、diff 检查，提交附实际验证证据。

## S2：首步连接

- [ ] openProject.ts：新库临时初始化后发布、关闭、自身合法产物重开；不覆盖原文件。
- [ ] 连接启用 foreign_keys、DELETE；失败清理自己的临时资源。
- [ ] 合成 media 行由测试直接插入，M1 不实现录音登记 API。
- [ ] 定向测试、typecheck、diff 检查后提交；完整格式拒绝/原子锁留 M2。

## S3：创建与读取

- [ ] manuscripts.ts、layers.ts：创建与按 id 读，引用有效，返回完整结果。
- [ ] units.ts：units 与 role=transcription 的正文同事务，读回再提交。
- [ ] 创建和读取返回同种形状（行字段加 text:string），缺失返回空。
- [ ] 真实临时库关闭全部连接重开，核对返回 id、正文、时间和关联。
- [ ] 定向测试、typecheck、diff 检查后提交。

## S4：回滚和验收

- [ ] 语段插入后正文写入失败，重开确认两表无本次行、旧内容不变，后续合法操作成功。
- [ ] npx vitest run src/db/desktop --maxWorkers=1。
- [ ] npm run typecheck。
- [ ] npm run check:architecture-guard。
- [ ] npm run check:agent-evals:smoke。
- [ ] npm run check:dev-agent-workflow-verify。
- [ ] npm run check:docs-governance。
- [ ] 无屏幕/IPC/选择器/旧代理修改，无旧文件兼容或迁移代码。
- [ ] 记录 #275 子进度，证据明确尚无桌面用户闭环；不关闭 issue、不解冻。

## 结束

- [ ] 实现任务完成、证据随提交保存后按 ADR-0051 删除本规格；M2 另起规格，不继续向本规格追加后续里程碑。
