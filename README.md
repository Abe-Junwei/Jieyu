# 解语 (Jieyu)

解语 (Jieyu) 是一个面向濒危语言研究与协作的本地优先应用。
当前阶段已完成核心数据层，基于 RxDB + TypeScript，按 DLx 标准建模。

## 当前能力

- 本地数据库：RxDB (Dexie storage)
- 数据模型：15 个集合，覆盖 DLx 关键实体
- 代码语言：TypeScript

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 类型检查

```bash
npx tsc --noEmit
```

## 项目结构

- db.ts: 数据模型、JSON Schema、数据库工厂
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

- 前端五标签页骨架（转写、标注、分析、写作、词典）
- 音频时间轴与标注编辑器
- AI 双模式 (AUTO / SUGGEST) 与审计流
- 多端协作同步与导出能力
