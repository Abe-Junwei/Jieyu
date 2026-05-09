---
title: 代码规模与维护成本评估
doc_type: architecture-assessment
status: active
owner: repo
last_reviewed: 2026-05-06
source_of_truth: code-scale-maintenance-assessment-2026-05-06
---

# 代码规模与维护成本评估

> 评估日期：2026-05-06
> 评估范围：全仓 TS/TSX 文件规模、src/hooks 平铺问题、src/services/LinguisticService 拆分状态、package.json scripts 组织
> 性质：架构层面长期关注点，非紧急 bug 修复

---

## 1. 现状数据（基于代码事实）

### 1.1 全仓规模

| 指标 | 数值 |
|------|------|
| TS/TSX 文件总数 | **1,719 个** |
| TS/TSX 总行数 | **~394,700 行** |
| `src/hooks/` 文件数 | **274 个**（含 1 个子目录 `speakerManagement/`，其余 268 个平铺） |
| `src/services/` 文件数 | **176 个**（含 5 个子目录：`acoustic/`、`alignment/`、`config/`、`stt/`、`vad/`） |
| `src/ai/chat/` 文件数 | **70 个**（全部平铺） |
| `package.json` scripts 数 | **267 条** |

### 1.2 LinguisticService 拆分真相

**关键发现：拆分工作已在进行中，但策略不一致且未完成。**

| 文件 | 行数 | 角色 |
|------|------|------|
| `LinguisticService.ts` | **1,684** | 主门面文件 |
| `LinguisticService.languageCatalog.ts` | **1,639** | ⚠️ **卫星文件，但比主文件还大** |
| `LinguisticService.orthography.ts` | **744** | 卫星文件 |
| `LinguisticService.tiers.ts` | **357** | 卫星文件 |
| `LinguisticService.constraints.ts` | **403** | 卫星文件 |
| `LinguisticService.cleanup.ts` | **303** | 卫星文件 |
| `LinguisticService.structuralProfiles.ts` | **206** | 卫星文件 |
| `LinguisticService.timeMapping.ts` | **129** | 卫星文件 |
| `linguisticServiceLazyLoaders.ts` | ~20 | lazy loader |

**LinguisticService 相关代码总计：~5,465 行生产代码 + 测试**

**问题诊断：**
1. `languageCatalog.ts`（1,639 行）本身已成为新的"超大文件"，需要二次拆分
2. 所有文件平铺在 `src/services/` 根目录，命名前缀冗长
3. 命名不一致：`LinguisticService.xxx.ts`（大写开头） vs `linguisticServiceLazyLoaders.ts`（小写开头）
4. 主文件仍有 1,684 行，未完全 facade 化

### 1.3 hooks 平铺现状

```
src/hooks/
├── speakerManagement/          ← 唯一子目录（6 个文件）
└── [268 个平铺文件]            ← 包括 useAiChat*.ts、useTranscription*.ts 等
```

按命名前缀大致分组：
- `useAiChat*`：~44 个生产文件 + 25 个测试
- `useTranscription*`：~20 个
- `useVoice*` / `useAudio*`：~15 个
- `useTimeline*`：~15 个
- `useLayer*` / `useUnit*`：~20 个
- 通用：`useDebounce`、 `useLocalStorage` 等

### 1.4 scripts 现状

`package.json` 已有**命名前缀分组**，无需额外注释：

| 前缀 | 数量 | 示例 |
|------|------|------|
| `test:` | ~45 | `test:e2e`, `test:vitest` |
| `check:` | ~60 | `check:css-*`, `check:architecture-guard` |
| `gate:` | ~35 | `gate:timeline-cqrs-*`, `gate:release-evidence` |
| `report:` | ~15 | `report:architecture-hotspots` |
| `data:` | ~10 | `data:language-seeds` |
| `perf:` | ~6 | `perf:ai` |

---

## 2. 方案评估

### 方案 A：拆分 LinguisticService.ts

**可行性：高（已在进行中，只需完成）**

当前 LinguisticService 已有 8 个卫星文件，说明拆分意图明确。建议分两波：

**A1. 低风险投资：建立 `src/services/linguistic/` 子目录（1 天）**
- 将现有 `LinguisticService.*.ts` 平铺文件移入 `src/services/linguistic/`
- 在 `src/services/linguistic/index.ts` 统一导出，保持 `import { xxx } from '../services/LinguisticService'` 向后兼容
- **风险极低**：纯文件移动 + re-export，不改逻辑
- **收益**：根目录清洁、文件语义归类

**A2. 中等风险：拆分 `LinguisticService.languageCatalog.ts`（1,639 行）（2–3 天）**
- 这是当前最大的卫星文件，已超出 architecture-guard 阈值
- 可拆为：`languageCatalogCore.ts`、`languageCatalogImportExport.ts`、`languageCatalogSearch.ts`
- **风险**：import 路径批量变更，需确保测试覆盖
- **收益**：降低单文件认知负荷

**A3. 主文件 facade 化（2–3 天）**
- 将 `LinguisticService.ts` 中剩余实现继续下沉到卫星文件
- 目标：主文件 <500 行（纯 re-export + 少量 glue code）
- **风险**：需验证所有外部 import 点不受影响

**优先级：P1（中短期）**
- 已在技术债修复方案（2026-05-08）P1-3 中登记
- `architecture-guard` 对 `LinguisticService direct calls` 有 max: 6 限制，说明治理层已关注

---

### 方案 B：hooks 按功能域分组

**可行性：中（import 路径批量变更，影响面广）**

当前 268 个平铺文件，建立子目录后预期结构：

```
src/hooks/
├── speakerManagement/        ← 已存在
├── ai/                       ← useAiChat*.ts 等 (~69 个)
├── transcription/            ← useTranscription*.ts 等 (~20 个)
├── voice/                    ← useVoice*.ts 等 (~15 个)
├── timeline/                 ← useTimeline*.ts 等 (~15 个)
├── layer/                    ← useLayer*.ts 等 (~20 个)
└── shared/                   ← useDebounce、useLocalStorage 等 (~10 个)
```

**风险分析：**

| 风险项 | 严重程度 | 说明 |
|--------|----------|------|
| Import 路径批量变更 | **高** | 约 268 个文件移动，影响全仓 import；需脚本自动化 |
| 测试 seam 断裂 | **中** | `useAiChat.structure.test.ts` 等依赖具体文件路径 |
| 历史 git blame 丢失 | **低** | 文件移动不影响 git blame（git 可追踪） |
| 子目录命名争议 | **低** | 需明确边界，避免"这个 hook 放哪"的反复讨论 |

**建议执行策略：**
1. **不要一次性全部移动**：先试点一个最小分组（如 `src/hooks/shared/` 或 `src/hooks/voice/`）
2. **使用脚本自动化**：`scripts/reorganize-hooks.mjs`，批量替换 import 路径
3. **保持向后兼容**：旧路径保留 re-export 至少 1 个 release cycle（如 `src/hooks/useDebounce.ts` → `export * from './shared/useDebounce'`）
4. **architecture-guard 同步更新**：`direct ../services imports` max: 3 等规则需验证不受子目录影响

**优先级：P2（中长期）**
- 当前平铺虽乱，但已有命名前缀约定，认知负荷可控
- 新成员 onboarding 成本确实存在，但非阻塞性
- 建议等 `useAiChat` 结构减压（P2 阶段）完成后再启动，避免两波大迁移冲突

---

### 方案 C：scripts 分组

**可行性：高（已有命名前缀分组，仅需注释增强）**

**现状评估：267 条 scripts 已有良好的命名前缀约定**，按前缀搜索和 tab 补全效率已足够。问题不在"找不到命令"，而在"命令数量多导致的心理压力"。

**建议：**

| 改进项 | 工作量 | 收益 |
|--------|--------|------|
| 在 `package.json` scripts 中插入 `// === 分组名 ===` 注释 | 10 分钟 | 视觉分组，降低心理压力 |
| 新增 `npm run help` 命令，按前缀输出命令列表 | 30 分钟 | 新人友好，快速定位 |
| 将不常用脚本移入 `scripts/.package-scripts/` 并通过 `run-s` 调用 | 1–2 天 | 减少 `package.json` 行数，但增加间接层 |

**不推荐：**
- 不引入 `scripty` 或 `npm-run-all` 等外部工具来拆分 `package.json`（增加依赖复杂度）
- 不将脚本移出 `package.json` 到独立配置文件（破坏 `npm run` 的默认约定）

**优先级：P3（低，可随其他改动顺手做）**
- 现有命名前缀已足够有效
- JSON 注释分组是低成本高收益的改进，可作为独立 PR（10 分钟改动）

---

## 3. 新增发现：未被提及的规模问题

### 3.1 `src/ai/chat/` 平铺（70 个文件）

`src/ai/chat/` 全部 70 个文件平铺，已超出一个目录的舒适管理上限（~50 个）。建议与 hooks 重组同步考虑：

```
src/ai/chat/
├── agentLoop/          ← agentLoop*.ts 及测试
├── memory/             ← sessionMemory.ts、backgroundMemory*.ts
├── tools/              ← localContextTools*、toolDecision*、intentTools.ts
├── pipeline/           ← sendTurn*.ts、streamPhase*.ts
└── index.ts            ← 统一导出
```

### 3.2 `LinguisticService.test.ts`（144 KB）

`LinguisticService.test.ts` 是当前仓库最大的测试文件之一（144 KB，约 3,000+ 行）。测试文件同样适用拆分原则：
- `LinguisticService.languageCatalog.test.ts`
- `LinguisticService.orthography.test.ts`
- 已有部分拆分（`LinguisticService.orthography.test.ts`、`LinguisticService.structuralProfiles.test.ts` 等），但主测试文件仍过大

### 3.3 构建时间基线缺失

问题描述中提到"Vite 冷启动和测试集越来越大"，但**当前无构建时间基线**。建议：
- 建立 `scripts/perf/build-time-baseline.mjs`，记录冷启动、热更新、全量测试时间
- 设定阈值：冷启动 >30s、全量测试 >5min 时触发预警

---

## 4. 建议执行顺序

```
Week  1  2  3  4  5  6  7  8
     [A1]
        [A2][A3]
              [B 试点]
                 [B 扩展]
```

| 顺序 | 方案 | 范围 | 预计工作量 | 前置条件 |
|------|------|------|-----------|----------|
| 1 | **A1** | 建立 `src/services/linguistic/` 子目录，移动现有卫星文件 | 1 天 | 无 |
| 2 | **A2** | 拆分 `LinguisticService.languageCatalog.ts`（1,639 行） | 2–3 天 | A1 完成 |
| 3 | **A3** | 主文件 facade 化（<500 行目标） | 2–3 天 | A2 完成 |
| 4 | **C** | `package.json` scripts 注释分组 | 10 分钟 | 无，可独立 |
| 5 | **B** | hooks 重组试点（先 `shared/` 或 `voice/`） | 1–2 天 | `useAiChat` P2 结构减压完成后 |
| 6 | **B** | hooks 全面重组 | 3–5 天 | 试点成功 + 脚本自动化验证 |

**关键约束：**
- 方案 B（hooks 重组）必须在 `useAiChat` 结构减压完成后再启动，避免两波大迁移冲突
- 所有文件移动必须配合脚本自动化 import 路径替换，禁止手工逐文件修改
- 每次移动后必须运行 `npm run typecheck`、`npm run check:architecture-guard`、相关 vitest 子集
- 保留向后兼容 re-export 至少 1 个 release cycle

---

## 5. 与现有计划的衔接

| 现有计划 | 关联点 | 建议 |
|----------|--------|------|
| 技术债修复方案-2026-05-08（P1-3） | 已登记 LinguisticService.ts 为超大业务文件 | **直接执行 A1–A3**，不另起规划 |
| AI智能体架构改进方案（P2 结构减压） | `useAiChat` 下沉到 `src/ai/` | **B 等 P2 完成后再启动** |
| architecture-guard.config.mjs | `LinguisticService direct calls` max: 6 | A3 完成后重新评估阈值 |
| `docs/architecture/仓库现状与代码地图.md` | 质量门禁已成型 | 更新代码地图中的文件数量统计 |

---

## 6. 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Import 路径批量替换遗漏 | 中 | 高 | 脚本自动化 + `typecheck` 硬门禁 |
| 测试 seam 断裂 | 中 | 中 | 移动文件时同步移动测试；保持测试路径不变或更新 test seam |
| 两波迁移冲突（A + B） | 中 | 高 | A 与 B 串行执行，不并行 |
| 子目录命名反复争论 | 低 | 低 | 先试点，用数据验证而非讨论 |
| 新人认知负荷未显著降低 | 低 | 中 | 建立 `npm run help` 或目录 README 作为补偿 |

---

*本评估基于 2026-05-06 代码快照。数据口径：`find src -name "*.ts" -o -name "*.tsx" | wc -l`、`wc -l`、architecture-guard 配置、package.json scripts 枚举。*
