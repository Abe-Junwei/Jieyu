---
title: 代码治理计划（修订版 v1 归档快照）
doc_type: architecture-governance-plan-archive
status: archived
owner: repo
last_reviewed: 2026-05-08
source_of_truth: code-governance-plan-2026-05-06-v1-archive
---

# 代码治理计划（修订版）

> 状态：可执行 | 基线：2026-05-08 | 规划人：Agent
>
> 本方案替代初版七波次方案，解决了与 `architecture-guard.config.mjs` 的兼容性冲突。

---

## 一、核心约束：先兼容门禁，再动代码

`architecture-guard.config.mjs`（72 条规则）是硬门禁。任何文件移动若导致规则 `file` 路径失效，会触发「Missing guarded file」硬失败。

**原则：先改规则（Phase 0），再拆文件（Wave 1+）。**

---

## 二、Phase 0：门禁迁移准备（必须先做）

### 0.1 Guard 规则从固定路径 → 模式匹配

| 规则类型 | 旧写法 | 新写法 | 状态 |
|---------|--------|--------|------|
| `hookRule` | `file: 'src/hooks/${name}.ts'` | `matchRegex: /^src/hooks/(?:[^/]+/)?${name}\.(ts\|tsx)$/` | ✅ 已落地 |
| `pageControllerRule` | `file: 'src/pages/${name}.tsx'` | `matchRegex: /^src/pages/(?:[^/]+/)?${name}\.tsx$/` | ✅ 已落地 |
| `patternRule`（hooks 批量） | `^src/hooks/use.*\.ts$` | `^src/hooks/(?:[^/]+/)?use.*\.ts$` | ⏳ 待确认 |

### 0.2 新增 `allowlist` 机制

在 guard 规则引擎中引入 `allowlist: string[]` 字段。当文件命中 `matchRegex` 但不在 `allowlist` 中时，仅报 warning（不硬失败）。这允许：

1. 先创建新子目录文件（如 `src/hooks/audio/useAudioRecorder.ts`）
2. 更新 allowlist 将其纳入正式监管
3. 从旧路径迁移导出（保留旧文件作为 re-export  shim）
4. 清理旧文件并从 allowlist 移除

### 0.3 基线脚本自动化

- 脚本：`scripts/report-code-scale-baseline.mjs`（✅ 已创建）
- 运行：`node scripts/report-code-scale-baseline.mjs`
- 输出：JSON 到 stdout，包含文件数、行数、TOP20、目录 flat 数
- 建议：每次 Wave 完成后运行一次，写入 `reports/code-scale/` 时间戳目录

### 0.4 规则配置拆分

`architecture-guard.config.mjs`（909 行）按域拆分为：

```
scripts/architecture-guard/
  ├── index.mjs              # 聚合导出
  ├── rules.pages.mjs        # 页面/控制器规则
  ├── rules.hooks.mjs        # Hooks 规则
  ├── rules.services.mjs     # 服务层规则
  ├── rules.components.mjs   # 组件规则
  └── rules.css.mjs          # CSS 规则
```

主配置 `index.mjs` 用 `import * as pages from './rules.pages.mjs'` 聚合。保持向后兼容（`architectureGuardRules` 导出不变）。

---

## 三、Wave 1：紧急阈值释放（本周）

### 1.1 VoiceAgentService.ts（938/950 行，98.7%）

**现状：** 单个文件承载语音代理全部逻辑（连接管理、状态机、事件分发、TTS 集成）。

**拆分方向：**

```
src/services/voiceAgent/
  ├── index.ts                    # 重新导出，保持旧导入兼容
  ├── VoiceAgentService.ts        # 核心 orchestrator（~400 行）
  ├── VoiceAgentConnection.ts     # WebSocket / RTC 连接管理
  ├── VoiceAgentStateMachine.ts   # 状态机（idle → listening → thinking → speaking）
  ├── VoiceAgentEventBus.ts       # 内部事件分发
  └── VoiceAgentTtsAdapter.ts     # TTS 接口适配
```

**Guard 配合：** 新增 `serviceRule` 支持 `src/services/${name}/index.ts` 模式，先纳入 allowlist。

### 1.2 useTranscriptionWaveformBridgeController.ts（612/620，98.7%）

**拆分方向：** 将波形渲染逻辑（Canvas/WebGL）与数据桥接逻辑分离。

```
src/pages/transcription/
  ├── useTranscriptionWaveformBridgeController.ts   # 保留，瘦身至 ~400 行
  └── useWaveformRenderer.ts                        # 纯渲染 hook
```

### 1.3 useTranscriptionData.ts（529/600，88.2%）

**暂不拆分**，监控至 550 行再行动。当前有缓冲空间。

---

## 四、Wave 2：超大服务层拆分（2-3 周）

### 2.1 LinguisticService（1685 行 + 1640 行 languageCatalog）

**问题：** 命名不一致（`LinguisticService` vs `src/services/linguistic/` 目录不存在）。

**步骤：**
1. **先统一命名**：`LinguisticService` → `LanguageService`（或保留原名，子目录用 `linguistic/`）
2. **按域拆分**：
   ```
   src/services/linguistic/
     ├── index.ts                          # re-export
     ├── LanguageDetectionService.ts       # 语言检测
     ├── TransliterationService.ts         # 音译
     ├── LanguageCatalogService.ts         # 原 languageCatalog 逻辑
     └── types.ts                          # 共享类型
   ```
3. **Guard 配合**：新增 `src/services/linguistic/*.ts` patternRule，maxLines: 800

### 2.2 AI Chat 层重组（74 平铺文件）

```
src/ai/chat/
  ├── index.ts
  ├── types.ts
  ├── orchestration/
  │   ├── chatTurnManager.ts
  │   └── contextAssembler.ts
  ├── tools/
  │   ├── localContextToolExecutors.ts    # 原 1876 行，需拆
  │   ├── toolCallHelpers.ts              # 原 1638 行，需拆
  │   └── registry.ts
  └── adapters/
      ├── providerAdapter.ts
      └── streamParser.ts
```

**关键：** `localContextToolExecutors.ts`（1876 行）和 `toolCallHelpers.ts`（1638 行）是 TOP5 大文件，必须拆分。

---

## 五、Wave 3：Hooks 分组（3-4 周）

`src/hooks/` 268 个平铺文件。

**按域分组（不一次性搬完，分批）：**

```
src/hooks/
  ├── index.ts                    # 保留，重新导出所有公共 hooks
  ├── audio/
  │   ├── useAudioRecorder.ts
  │   └── useAudioPlayback.ts
  ├── transcription/
  │   ├── useTranscriptionData.ts
  │   └── useTranscriptionWaveformBridgeController.ts
  ├── ai/
  │   ├── useAiChat.ts
  │   └── useAiMemory.ts
  └── ...（逐步扩展）
```

**迁移策略：**
1. 新 hook 直接写入子目录
2. 旧 hook 保留在原位，通过 `src/hooks/index.ts` 统一导出
3. 当某域积累到 5+ 个相关 hook 时，批量迁移该域
4. 使用 allowlist 机制平滑过渡

---

## 六、Wave 4：类型定义外迁（4-5 周）

### 4.1 src/db/types.ts（1269 行）

```
src/db/types/
  ├── index.ts
  ├── transcription.ts
  ├── segment.ts
  ├── annotation.ts
  └── user.ts
```

### 4.2 src/db/schemas.ts（1291 行）

```
src/db/schemas/
  ├── index.ts
  ├── transcriptionSchema.ts
  ├── segmentSchema.ts
  └── ...
```

---

## 七、Wave 5：组件瘦身（5-6 周）

### 5.1 TOP 组件拆分

| 组件 | 行数 | 拆分方向 |
|------|------|----------|
| `TranscriptionPage.ReadyWorkspace.tsx` | 2204 | 已接近 guard 上限 2600，需按面板拆分 |
| `SettingsModal.tsx` | 1723 | 按设置类别拆分子组件 |
| `AiAnalysisPanel.tsx` | 1583 | 按分析类型拆分 |
| `LayerActionPopover.tsx` | 1555 | 按图层操作类型拆分 |

---

## 八、Wave 6：基础设施与 E2E 清理（持续）

### 8.1 E2E pageerror 去重

- ✅ `tests/e2e/_helpers/pageErrorFilter.ts` 已创建
- 替换 7+ 个 spec 中的重复 `page.on('pageerror', ...)` 逻辑
- 迁移方式：搜索 `page.on\(['"]pageerror['"]`，统一替换为 `trackPageErrors(page)`

### 8.2 循环依赖监控

- 当前 0 个循环依赖
- 建议：CI 中增加 `npx madge --circular --extensions ts,tsx src` 检查

---

## 九、执行检查清单

| # | 任务 | 负责人 | 截止 | 状态 |
|---|------|--------|------|------|
| 1 | Phase 0.1：guard 模式匹配落地 | Agent | 2026-05-08 | ✅ |
| 2 | Phase 0.2：allowlist 机制实现 | 待分配 | 2026-05-09 | ⏳ |
| 3 | Phase 0.3：基线脚本运行并归档 | Agent | 2026-05-08 | ✅ |
| 4 | Phase 0.4：guard 规则按域拆分 | 待分配 | 2026-05-12 | ⏳ |
| 5 | Wave 1.1：VoiceAgentService 拆分 | 待分配 | 2026-05-15 | ⏳ |
| 6 | Wave 1.2：waveform bridge 瘦身 | 待分配 | 2026-05-15 | ⏳ |
| 7 | Wave 2.1：LinguisticService 拆分 | 待分配 | 2026-05-22 | ⏳ |
| 8 | Wave 2.2：AI Chat 层重组 | 待分配 | 2026-05-29 | ⏳ |
| 9 | Wave 3：Hooks 分组启动 | 待分配 | 2026-06-05 | ⏳ |

---

## 十、附录：接近阈值文件实时监控

运行 `node scripts/report-code-scale-baseline.mjs` 获取最新数据。

**当前热点（2026-05-08 基线）：**

| 文件 | 当前行数 | 阈值 | 使用率 | 行动 |
|------|---------|------|--------|------|
| `VoiceAgentService.ts` | 1685* | 950 | 177% | 🔴 Wave 1 紧急拆分 |
| `useTranscriptionWaveformBridgeController.ts` | 612 | 620 | 98.7% | 🟡 Wave 1 拆分 |
| `useTranscriptionData.ts` | 529 | 600 | 88.2% | 🟢 监控 |
| `localContextToolExecutors.ts` | 1876 | — | — | 🔴 Wave 2 拆分 |
| `toolCallHelpers.ts` | 1638 | — | — | 🔴 Wave 2 拆分 |

> *VoiceAgentService 的 guard 阈值可能不同，需单独核查。上表基于基线脚本统计。

---

## 十一、归档

- 初版七波次方案：`docs/architecture/_archive/code-governance-plan-2026-05-06-v1.md`
