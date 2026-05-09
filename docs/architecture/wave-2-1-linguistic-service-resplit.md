---
title: Wave 2.1 补充：LinguisticService 二次拆分设计
doc_type: architecture-design-note
status: active
owner: repo
last_reviewed: 2026-05-06
source_of_truth: wave-2-1-linguistic-service-resplit
---

# Wave 2.1 补充：LinguisticService 二次拆分设计

## 问题
`LinguisticService.languageCatalog.ts`（1,639 行）**比主文件还大**，"门面+卫星"拆分策略已局部失效。

## 目标目录结构

```
src/services/linguistic/
  ├── index.ts                          # 统一 re-export，保持向后兼容
  ├── LinguisticService.ts              # 核心门面（目标 <800 行）
  ├── types.ts                          # 跨子模块共享类型
  │
  ├── languageCatalog/                  # ← 二次拆分目标
  │   ├── index.ts
  │   ├── query.ts                      # 查询/搜索逻辑（~500 行）
  │   ├── mutate.ts                     # 写入/更新逻辑（~400 行）
  │   ├── seedLookup.ts                 # ISO 639-3 种子数据查询（~300 行）
  │   ├── validation.ts                 # 输入校验与规范化（~200 行）
  │   └── types.ts                      # languageCatalog 专用类型
  │
  ├── orthography/
  │   ├── index.ts
  │   ├── query.ts
  │   ├── mutate.ts
  │   └── bridge.ts                     # 正字法桥接映射
  │
  ├── tier/
  │   ├── index.ts
  │   ├── query.ts
  │   ├── mutate.ts
  │   └── constraints.ts                # 从 LinguisticService.constraints.ts 迁入
  │
  └── timeMapping/
      ├── index.ts
      └── resolver.ts
```

## 迁移路径

| 步骤 | 操作 | 验收 |
|------|------|------|
| 1 | 创建 `src/services/linguistic/` 目录和 `index.ts` re-export | `npm run typecheck` |
| 2 | 将 `LinguisticService.ts` 移入目录，更新 guard 规则路径 | `check:architecture-guard` OK |
| 3 | 将 `LinguisticService.languageCatalog.ts` 拆为 `languageCatalog/*.ts` | `npm run typecheck` |
| 4 | 逐步迁移 `LinguisticService.orthography.ts` / `.tiers.ts` / `.constraints.ts` | `npm run typecheck` |
| 5 | 删除旧文件，更新所有 import 路径（或保留 shim）| `npm run typecheck` + `npm test` |

## Guard 规则同步

```javascript
// 主文件规则：从固定路径改为 matchRegex
{
  matchRegex: /^src\/services\/linguistic\/LinguisticService\.ts$/,
  maxLines: 800,
  // ... 其余约束不变
},

// languageCatalog 批量规则
patternRule(/^src\/services\/linguistic\/languageCatalog\/.*\.ts$/, {
  maxLines: 600,
  maxFunctions: 25,
}),

// 其他子模块批量规则
patternRule(/^src\/services\/linguistic\/(orthography|tier|timeMapping)\/.*\.ts$/, {
  maxLines: 500,
}),
```

## 对外兼容

`src/services/linguistic/index.ts` 统一导出所有符号：

```typescript
// src/services/linguistic/index.ts
export * from './LinguisticService';
export * from './languageCatalog';
export * from './orthography';
export * from './tier';
export * from './timeMapping';
export * from './types';
```

现有代码 `import { ... } from '../services/LinguisticService'` 无需改动——通过目录结构或 `package.json` `exports` 字段兼容。若无法做路径兼容，则批量替换 import（约 30+ 处，可用 `sed` / IDE 全局替换）。
