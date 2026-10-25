---
title: desktop-project-sqlite design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-25
source_of_truth: desktop-project-sqlite-spec
depends_on:
  - ./requirements.md
---

# Design — desktop-project-sqlite（M1）

## 1. 成熟方案扫描 / Research

- 仓库：sqliteStoragePort.ts 已用 better-sqlite3 同步事务，sqliteStorageHost.ts 已在主进程管理连接；新路径把业务读回移入事务，不照搬提交后读回。
- 标杆：采用 SQLite 原生约束和 [better-sqlite3 同步 transaction](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)，不新增 ORM，不使用 async 事务回调。
- 规范：[SQLite 外键文档](https://www.sqlite.org/foreignkeys.html) 要求逐连接在事务外显式开启外键；重开再设置并测试。
- 后续 IPC 适配现有 contextBridge，[Electron 官方模式](https://www.electronjs.org/docs/latest/tutorial/ipc) 包装有限业务调用，不暴露 ipcRenderer；本片不接 IPC。
- 反模式：一次 IPC 不使多库分次提交原子；旧 StoragePort 类型断言不代表实现齐全。已有文件不能运行补表来伪装格式兼容。
- 风险：原生模块 ABI、事务外读回、初始化失败资源残留。DELETE 不保证运行中普通复制一致，[备份](https://www.sqlite.org/backup.html) 属于 M6 验收。
- 结论：复用已安装 better-sqlite3 和构建基础，新写最小领域 SQL；无新增依赖及对应许可/包体成本。

## 2. 结构与调用

- 类别：effect 为连接和持久化，actions 为创建；无页面、controller 或 React state 改动。
- schema.ts 一次定义 ADR-0085 初始表集；首步只实现文稿、转写层、语段创建和本闭环必要的按 id 读取，不铺全表 CRUD。
- 测试直接插入 media 合成行满足外键，业务录音登记留在 M2；不新增隐式空录音。
- units.create 与按 id 读统一为行字段加 text:string，正文固定 role=transcription，不新增包装类型；其他内容类型编辑留后续片，不静默映射。
- 同步事务内写 units、unit_texts 并读回；异常从事务内部抛出，只有提交成功才返回。测试在第一张表已写后注入失败。
- 新建使用同目录临时库、初始化后发布；打开自身合法产物支持重开。禁止覆盖原库；任意输入文件的完整格式拒绝与并发生命周期在 M2 验收。
- M1 不以仅测试自身产物通过宣称通用 openProject 已达桌面交付标准，也不向现有屏幕开放。

## 3. 子切片与落位

- S1：schema.ts 与定向约束测试；全部表只在新建时建立。
- S2：openProject.ts，供本阶段新建/关闭/合法产物重开；连接配置及初始化资源清理。
- S3：manuscripts.ts、layers.ts、units.ts；业务创建、按 id 读及完整返回；类型就近定义。
- S4：project.test.ts（或同目录等价测试），成功重开和写到一半失败重开；一片一证据，不为每个函数建机械测试套件。

## 4. 决策与后续范围

- [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md) 允许 D14 前按新决定调整开发结构，只重建受控合成项目；M1 不追加删除字段或后续功能验收。删除另见 ADR-0087 与独立规格。

- 活存储按 ADR-0085；跨文稿父语段规则有效，但其专门验收在 M2。不引入父语段必须在父层或禁止成环的新产品规则。
- application_id/完整结构拒绝、双进程原子锁、media.ts、speakers.ts、settings 与边界更新属于 M2，不写进 M1 完成条件。
- 有限 IPC 与过期句柄属于 M3；新入口与首个编辑流程一并在 M4 接替；不先发布只能列出文稿的入口。
- 分析图、词条、目录、模型运行和时间映射的落点见 [ADR-0088](../../../adr/0088-desktop-sqlite-domain-landings.md)。M1 不补这些表，也不写入 `settings_json`。

## 5. 接入与失败边界

- 旧屏幕、旧代理与 feature flag 保持原接线，本阶段不做双写、不安装新客户端。
- 初始化失败只清理本次创建的临时资源；原文件不覆盖、不删除。写事务失败不留本次行。
- 关闭全部连接再读回；失败后检查旧数据、残留和下一次合法写入，不用同连接 SELECT 替代持久验收。

## 6. 验证与退出

- npx vitest run src/db/desktop --maxWorkers=1；npm run typecheck。
- 适用守卫：check:architecture-guard、check:agent-evals:smoke、check:dev-agent-workflow-verify；文档变更跑 check:docs-governance。
- 无界面改动，本片不以 Chromium E2E 或 Electron 冒烟作新增验收；M3 起增加真实 Electron 证据，M4 遵守交互门槛。
- 完成只记 #275 子进度；后续另起规格。按 ADR-0086，#326 迁入和 #281 本次演练及其阻塞已取消；GitHub 已同步并核对取消状态。M4 有限开放不改变本片验收。
