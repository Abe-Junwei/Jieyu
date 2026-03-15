# 解语 (Jieyu)

解语 (Jieyu) 是一个面向濒危语言研究与协作的本地优先应用。
当前阶段已完成核心数据层，基于 Dexie + TypeScript，按 DLx 标准建模。

## 当前能力

- 本地数据库：Dexie (IndexedDB)
- 数据模型：18 个集合，覆盖 DLx 关键实体
- 数据安全：支持全库 JSON 导出与导入（含冲突策略）
- 数据校验：入库前使用 Zod 校验（与数据库实现解耦）
- 代码语言：TypeScript

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 启动前端开发环境

```bash
npm run dev
```

3. 类型检查

```bash
npm run typecheck
```

4. 生产构建

```bash
npm run build
```

5. 运行 smoke tests

```bash
npm test
```

## 项目结构

- db.ts: Dexie 实例、Zod 校验、导入导出能力
- services/LinguisticService.ts: 数据访问服务层（数据库可替换边界）
- services/LinguisticService.test.ts: 服务层 smoke tests
- types/dlx.ts: DLx 业务类型导出
- package.json: 项目依赖与脚本配置
- tsconfig.json: TypeScript 配置

## 分支策略

- main: 稳定分支，可发布状态
- dev: 开发集成分支，功能完成后合并到 main

建议流程：

1. 从 dev 创建功能分支
2. 提交后发起 PR 合并回 dev
3. 周期性从 dev 合并到 main 并打版本标签

## 版本标签

- v0.1.0: 初始化数据层与工程基础配置

## 后续规划

- 完善五标签页功能细节（转写、标注、分析、写作、词典）
- 音频时间轴与标注编辑器
- AI 双模式 (AUTO / SUGGEST) 与审计流
- 多端协作同步与导出能力

## 当前前端状态

- 已完成五标签页路由骨架：转写、标注、分析、写作、词典
- 转写页已接入 Dexie，可读取数据库名称、集合数量与基础记录数

## 数据快照规范（迁移关键）

导出 JSON 结构如下：

```json
{
	"schemaVersion": 1,
	"exportedAt": "2026-03-12T08:00:00.000Z",
	"dbName": "jieyudb",
	"collections": {
		"utterances": [
			{
				"id": "utt_xxx",
				"textId": "text_xxx",
				"transcription": { "default": "..." },
				"startTime": 0,
				"endTime": 1,
				"isVerified": false,
				"createdAt": "...",
				"updatedAt": "..."
			}
		]
	}
}
```

字段说明：

- `schemaVersion`: 快照格式版本。当前为 `1`。
- `exportedAt`: 导出时间。
- `dbName`: 导出来源数据库名。
- `collections`: 以集合名为键的数据数组。

导入冲突策略：

- `upsert`: 默认策略，主键冲突时覆盖。
- `skip-existing`: 已存在主键跳过。
- `replace-all`: 先清空再导入。

注意事项：

- 当快照 `schemaVersion` 高于当前应用支持版本时，导入会被拒绝。
- 导入时会逐条执行 Zod 校验，非法数据会阻断导入。
