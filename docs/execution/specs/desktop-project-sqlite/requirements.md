---
title: desktop-project-sqlite requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-25
source_of_truth: desktop-project-sqlite-spec
---

# Requirements — desktop-project-sqlite（M1）

## 1. What & Why

- 按 [ADR-0085](../../../adr/0085-desktop-project-one-sqlite.md) 的第一步，完成单库文稿、转写层、语段和正文的写入与关闭重开读回。
- 对应[实施计划 M1](../../plans/desktop-project-sqlite-2026-10-25.md#m1单库业务原子性成立)，不继续扩展旧 SQLite StoragePort。
- 不做：IPC、屏幕、文件夹选择器、录音业务登记、任意已有库格式拒绝、双进程锁、旧文件迁移或 Dexie 对齐。完整格式拒绝、双进程锁与录音登记在 M2 交付。

## 2. 场景

1. 测试建立临时项目，直接以合成夹具插入 media，再经业务 API 创建文稿、转写层和带正文的语段；关闭全部连接后重开，按返回 id 读回。
2. units 行插入后、正文写入前发生失败，整个业务事务回滚；重开确认本次两表无残留、原有数据不变。

## 3. 验收

- [ ] schema.ts 是唯一 DDL，包含 ADR 全表集，必填、枚举、唯一键和外键约束按当前决定实现。
- [ ] 新建采用同目录临时文件初始化后发布，不覆盖原库；支持本实现创建的合法库重开。任意输入库的完整格式拒绝验收在 M2。
- [ ] 每次连接启用 foreign_keys，journal_mode 为 DELETE；新路径不使用关闭安全刷盘的设置。
- [ ] create 文稿引用夹具录音、层引用文稿；units.create 在一次同步事务内写 units 和 role=transcription 的 unit_texts，读回后提交。
- [ ] create 与按 id 读返回同种语段形状：行字段加 text:string；不存在的 id 返回空，不返回旧 Dexie 文档。
- [ ] 关闭全部连接后重开，返回 id、正文、时间与关联和创建结果一致。
- [ ] 写入中途失败后重开，两表无本次记录、既有内容不变，后续合法写入仍成功。
- [ ] 不修改现有屏幕、旧 StoragePort 安装和已有 SQLite 半成品；只用合成夹具，不读真实语料。

## 4. 落位

- 新增 src/db/desktop/schema.ts、openProject.ts、manuscripts.ts、layers.ts、units.ts 及同目录测试。
- 参数和结果类型就近定义；不为正文另加包装层，不引用旧 db/types.ts 文档形状。
- media 夹具由测试直接插入，不生成 media.ts；项目锁/IPC 等不写进本阶段任务。

## 5. 边界

- 范围与开发格式按 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)：D14 前只用合成项目，必要结构按新 ADR 调整并重建受控夹具；本片初始表集不是首发表集冻结承诺。

- M1 是 #275 的子进度，不关闭 issue、不解冻、不宣称桌面可用。
- application_id/结构严格拒绝、跨文稿父语段、原子锁及录音登记按 M2 另起规格；不向用户开放未验收路径。
- 保留其他会话 dirty 文件；旧 65 项测试通过只证明旧路径基线，不替代本验收。
