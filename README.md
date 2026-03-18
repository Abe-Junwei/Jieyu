# 解语 (Jieyu)

解语 (Jieyu) 是一个面向濒危语言研究与协作的本地优先应用。
当前阶段已完成核心数据层与互操作基础，基于 Dexie + TypeScript，按 CAM-v2/DLx 方向建模。

## 当前能力

- 本地数据库：Dexie (IndexedDB)
- 数据模型：26 个集合，覆盖语料、层、词法、备注、审计与 AI 基础实体
- 数据安全：支持全库 JSON 导出与导入（含冲突策略）
- 数据校验：入库前使用 Zod 校验（与数据库实现解耦）
- 代码语言：TypeScript
- 互操作：EAF、TextGrid、FLEx、Toolbox、Transcriber 双向转换
- 项目归档：JYM/JYT 导入导出

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
- src/pages/TranscriptionPage.tsx: 主转写工作区
- src/hooks/useTranscriptionData.ts: 转写页核心数据流与状态逻辑
- src/services/SnapshotService.ts: 恢复快照能力
- package.json: 项目依赖与脚本配置
- tsconfig.json: TypeScript 配置

## 分支策略

- main: 稳定分支，可发布状态
- dev: 开发集成分支，功能完成后合并到 main

建议流程：

1. 从 dev 创建功能分支
2. 提交后发起 PR 合并回 dev
3. 周期性从 dev 合并到 main 并打版本标签

## 开发工作流（Hook 结构纪律）

为避免再次出现 mega-hook，新增以下默认规则（从现在起执行）：

1. 复杂度阈值
- 单个 hook 超过 300 行，或 `useEffect/useMemo/useCallback` 总数超过 12 个时，必须拆分。

2. 新功能落位规则（先分类再实现）
- `state`：状态定义与最小 set/get。
- `derived`：纯派生计算（`useMemo`/纯函数）。
- `effect`：副作用与生命周期。
- `actions`：命令型写操作（含互斥、持久化）。
- 主编排 hook 仅负责组装，不承载具体业务细节。

3. PR 检查项（必填）
- 本次新增逻辑是否可独立 hook：`是/否`。
- 若 `否`：给出原因（例如依赖边界未稳定、属于临时过渡）。
- 是否触发阈值：`是/否`。
- 若触发阈值：本 PR 内完成拆分，或附上下一 PR 的拆分承诺。

4. 小步拆分节奏
- 每次新增功能后，优先在同一迭代内完成 1 次“顺手拆分”，避免累计债务。
- 拆分策略按“低风险切刀”：先派生，再副作用，再动作包装，最后持久化协调。

5. 回归门禁
- 任何结构性拆分必须通过：
	- `npm run typecheck`
	- `npm test`
- 不通过不得合并。

6. 代码评审重点
- 是否出现 orchestrator 以外的业务逻辑集中。
- 是否有跨层依赖倒置（例如 effect 直接操作持久化细节）。
- 返回对象是否按 `state/derived/actions` 分组组装，便于阅读与维护。

## 版本标签

- v0.1.0: 初始化数据层与工程基础配置

## 后续规划

- 完善五标签页功能细节（转写、标注、分析、写作、词典）
- 音频时间轴与标注编辑器
- AI 双模式 (AUTO / SUGGEST) 与审计流
- 多端协作同步与导出能力

## 当前前端状态

- 已完成五标签页路由骨架：转写、标注、分析、写作、词典
- 转写页为当前主工作区（含波形编辑、层管理、导入导出、备注）
- 标注/分析/写作/词典页当前为占位实现，待逐步完善

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
