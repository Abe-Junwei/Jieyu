# Services 分层规则

## 背景

项目存在两个 services 目录：
- `/services` - 核心业务服务（文件导入/导出、数据格式转换）
- `/src/services` - UI层服务（音频处理、语音智能体）

## 目标

统一 services 目录结构，消除边界模糊，建立清晰的依赖规则。

## 分层结构

```
src/services/
├── core/                    # 核心业务逻辑
│   ├── formats/            # 文件格式服务
│   │   ├── EafService.ts
│   │   ├── TextGridService.ts
│   │   ├── FlexService.ts
│   │   └── ToolboxService.ts
│   ├── transcription/      # 转写核心逻辑
│   │   ├── LinguisticService.ts
│   │   └── CommandService.ts
│   └── interop/             # 互操作服务
│       └── InteropDiffService.ts
│
├── ui/                      # UI层服务（可调用 core）
│   ├── audio/               # 音频处理
│   │   ├── AudioAnalysisService.ts
│   │   └── SpeechQualityAnalyzer.ts
│   ├── voice/               # 语音智能体
│   │   ├── VoiceAgentService.ts
│   │   ├── VoiceInputService.ts
│   │   └── IntentRouter.ts
│   └── panels/              # 面板相关
│       └── CommandResolver.ts
│
└── platform/                # 平台特定逻辑
    ├── browser/             # 浏览器专用
    │   ├── WakeWordDetector.ts
    │   └── EarconService.ts
    └── shared/              # 跨平台共享
        └── GlobalContextService.ts
```

## 依赖规则

1. **core 服务**：
   - 禁止依赖 `src/` 外部模块（除 `db.ts`）
   - 禁止依赖 React hooks
   - 可依赖其他 core 服务

2. **ui 服务**：
   - 可调用 core 服务
   - 可依赖 React hooks
   - 可依赖其他 ui 服务

3. **platform 服务**：
   - `browser/` 仅在浏览器环境使用
   - `shared/` 可跨平台使用

## 迁移策略

### 阶段1：建立目录结构
```bash
mkdir -p src/services/{core,ui,platform}
```

### 阶段2：渐进迁移
每迁移一个服务，原位置留桥接导出：

```typescript
// 迁移完成后
// src/services/core/formats/EafService.ts

// 原 services/EafService.ts 改为:
export { ... } from '../src/services/core/formats/EafService';
```

### 阶段3：清理
迁移完成后，删除旧位置文件，更新所有 import 路径。

## 命名约定

- 服务文件：`*.Service.ts` 或 `*Service.ts`
- 测试文件：`*.Service.test.ts`
- 索引文件：`index.ts`（如需要barrel导出）

## 验证

```bash
# 检查无循环依赖
npx madge --circular src/services/

# 检查无违规导入
# (core 不应 import ui/platform)
```

## 现有服务归属建议

| 服务 | 建议层级 | 说明 |
|------|----------|------|
| LinguisticService | core/transcription | 核心业务逻辑 |
| EafService | core/formats | 文件格式 |
| TextGridService | core/formats | 文件格式 |
| CommandService | core/transcription | 命令管理 |
| InteropDiffService | core/interop | 互操作 |
| VoiceAgentService | ui/voice | UI语音智能体 |
| AudioAnalysisService | ui/audio | UI音频处理 |
| IntentRouter | ui/voice | UI意图路由 |
| CommandResolver | ui/panels | UI命令解析 |
| WakeWordDetector | platform/browser | 平台专用 |
| GlobalContextService | platform/shared | 跨平台 |

## 待讨论

- `/services` 和 `src/services` 的最终合并时机
- db.ts 是否纳入 services 层级
- 是否有 services 需要进一步拆分
