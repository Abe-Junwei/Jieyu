# 规划：正字法选择与桥接规则收口方案（2026-04-04）

> 注：本文保留少量历史术语 `transform`，仅用于记录 2026-04-04 当日讨论语境；当前实现、测试与产品口径统一使用“桥接规则 / bridge / bridgeId”。

## 一、背景

当前仓库已经具备以下能力：

- 层可以绑定目标语言与目标正字法
- 用户可以选择现有正字法，或内嵌新建正字法
- 系统已经具备 source orthography -> target orthography 的桥接规则实体、预览、校验与运行时调用能力
- 导入、AI 写回、assistant 听写等路径已经开始消费 bridge runtime

但当前产品语义仍有一个没有完全收口的问题：

> “正字法选择”与“transform 桥接”在认知上容易混在一起，导致用户会自然追问：
> 如果我已经给目标层选了正字法，为什么还要 transform？
> 如果我想保留来源文本，系统是不是会把原文覆盖掉？

这个追问是合理的，说明当前系统应该把两件事明确拆开：

1. 层的目标正字法
2. 跨来源写入时的桥接策略

本方案目标不是扩展技术能力，而是先把产品语义、交互边界与默认行为定清楚。

---

## 二、核心结论

### 2.1 正字法选择与 transform 不是一回事

应明确区分三层概念：

1. 目标层正字法
   - 定义“这个层最终用哪套书写系统存储、显示、编辑”

2. 源文本正字法
   - 定义“这段进入系统的文本原本按哪套写法产生”

3. 写入桥接策略
   - 定义“当源文本正字法与目标层正字法不一致时，写入前如何处理”

其中：

- 正字法选择解决的是“目标层契约”
- transform 解决的是“跨来源写入时是否自动改写”

### 2.2 默认主流程不应暴露 transform

对绝大多数用户与绝大多数常见流程，默认心智应为：

1. 选择语言
2. 选择该层使用的正字法
3. 没有合适的就新建一个
4. 之后直接在这一层按该正字法录入或编辑

在这条主流程中：

- 不需要解释 transform
- 不需要要求用户配置 source -> target 规则
- 不应该让用户觉得“建层之前还要先理解转换引擎”

### 2.3 transform 只属于桥接场景

transform 只在以下场景有意义：

1. 外部导入
   - 外部文件的文本原本属于另一套正字法

2. 跨层写入
   - 从来源层把文本投影、复制、AI 写回到目标层

3. 自动化写入
   - 语音听写、assistant、AI tool call 等自动路径写入目标层时，来源文本与目标层正字法不一致

4. 受控派生
   - 明确要从 A 正字法生成 B 正字法版本时

---

## 三、产品原则

### 原则 1：目标层永远先定义“要什么”，不是先定义“怎么转”

用户建层时首先回答的是：

- 这是转写层还是翻译层
- 目标语言是什么
- 这层使用哪套正字法

而不是：

- 来源文本是什么
- 要不要转换
- 用什么引擎转换

### 原则 2：保留来源文本优先于自动覆盖

当用户明确存在“来源文本”时，系统默认应优先保证来源文本可保留，而不是在后台隐式把来源文本改写掉。

因此，transform 的默认语义应为：

- “为写入目标层生成一份目标表示”
- 不是“把来源文本原地改写成另一套写法”

### 原则 3：transform 是高级桥接能力，不是日常录入门槛

transform 应定位为：

- 导入兼容能力
- 跨层桥接能力
- 自动化写入兼容能力

而不是：

- 每个建层用户都必须理解的必备概念

### 原则 4：单层场景下不默认转换

如果用户只有一个层，且直接在该层输入文本，那么：

- 系统不应主动猜测来源正字法
- 系统不应自动把输入内容改写成另一套正字法
- 用户输入什么，就按该层当前编辑结果存什么

---

## 四、推荐的用户心智模型

### 4.1 基础模式

一句话定义：

> 每个层只负责保存自己的目标文本表示。

用户只需要理解：

- 这一层写什么语言
- 这一层用哪套正字法

### 4.2 桥接模式

一句话定义：

> 当文本从别处进入当前层时，系统可以选择是否先做一次 source -> target 变换。

用户只需要在需要时理解：

- 这段文本来自哪里
- 目标层想存成什么写法
- 进入目标层前要不要自动转换

### 4.3 保留来源模式

一句话定义：

> 来源层保留原文，目标层保存转换后的副本，两者并存。

这应作为推荐模式，而不是例外模式。

---

## 五、场景决策矩阵

### 5.1 直接在目标层人工输入

默认行为：

- 不做 transform
- 不询问来源正字法
- 按目标层当前正字法保存用户输入

原因：

- 这是最纯粹的“层自身编辑”
- 不存在跨来源桥接问题

### 5.2 从来源层复制/投影到目标层

默认行为：

- 若来源层 orthographyId 与目标层 orthographyId 相同：直接写入
- 若不同：允许通过 active transform 写入目标层副本
- 来源层原文始终保留，不被覆盖

交互要求：

- 不要求用户新建“中间层”
- transform 只是 source -> target 的桥接规则

### 5.3 AI/assistant/语音听写写回目标层

默认行为：

- 如果系统已能识别明确来源层，则把该来源层 orthography 作为 source
- 如果没有显式来源层，但业务上存在稳定 fallback 来源层，则允许使用 fallback source orthography
- 仅对“写入目标层的文本”应用 transform
- 不反向修改来源层原文

### 5.4 外部文件导入

这是最需要明确产品决策的场景。

建议把导入写入策略显式分成三种：

1. 保留原文
   - 导入文本直接作为来源表示保存
   - 不自动改写

2. 转换后写入目标层
   - 按 source -> target transform 生成目标文本
   - 适合用户明确只关心目标层表示

3. 同时保留原文与转换结果
   - 推荐默认策略
   - 来源文本作为来源层或原始副本保存
   - 目标层保存转换后的文本

其中第 3 种应被视为最安全的产品默认值。

---

## 六、明确的产品决策

### 2026-04-04 已确认

本节以下决策已由产品方向确认，可作为后续实现与设计同步的正式依据：

- 已确认：建层主流程默认移除 transform 管理
- 已确认：产品文案中优先使用“桥接规则”，弱化直接暴露 `transform`
- 已确认：导入默认策略采用“原文与转换结果同时保留”

未另行推翻前，后续代码、设计稿、文案与测试均以此为准。

### 决策 A：建层面板默认不展示 transform 管理

建议：

- 项目创建
- 新建转写层
- 新建翻译层

这三条主路径默认只展示：

- 语言选择
- 正字法选择
- 内嵌新建正字法

不默认展示 transform 管理区。

transform 管理应下沉到以下位置之一：

1. 正字法详情页 / 正字法编辑页
2. 导入设置弹窗的高级区
3. “跨层桥接规则”单独入口

### 决策 B：transform 的正式命名改成“桥接规则”或“导入/写入桥接规则”

当前“transform”从工程角度准确，但从产品语义上容易让用户误解为：

- 这是正字法本体的一部分
- 或者这是建层必配项

建议在 UI 文案上弱化技术词，改成：

- 导入桥接规则
- 写入桥接规则
- 来源到目标的自动改写规则

### 决策 C：来源文本默认不可被隐式覆盖

应明确以下契约：

- source -> target transform 只作用于目标写入结果
- 不修改来源层文本
- 不把来源表示“就地升级”为目标表示

### 决策 D：单层录入禁止隐式 transform

如果用户直接在某层手动输入文本：

- 系统不做自动 transform
- 系统不根据当前语言或脚本推断去改写用户输入

### 决策 E：导入必须显式暴露“保留来源”策略

导入是唯一一个用户最容易误会“系统是不是偷偷改了原文”的入口。

因此导入时必须允许用户明确选择：

- 仅保留原文
- 仅写入目标表示
- 原文与目标表示同时保留

---

## 七、交互收口方案

### 7.1 项目创建 / 新建层

保留：

- 语言
- 正字法
- 新建正字法

移除默认暴露：

- transform 管理区

仅在以下条件下展示“高级桥接设置”入口：

- 用户主动展开高级设置
- 用户选择“从现有层派生”
- 用户明确开启“导入时自动改写”

### 7.2 正字法详情

transform 若继续存在于产品中，建议挂在正字法详情页，而不是新建层主流程中。

推荐结构：

- 正字法基本信息
- 字体 / bidi / 输入提示
- 来源桥接规则

这样用户心智会更清楚：

> 这是一套附属于正字法的高级互操作规则，而不是建层本身。

### 7.3 导入流程

导入弹窗新增“写入策略”区：

- 保留原文
- 转换后写入目标层
- 原文与转换结果同时保留（推荐）

并在说明文案中明确：

- transform 不会覆盖来源层原文
- transform 只影响写入目标层的那份文本

### 7.4 AI / Assistant / 听写

保持当前运行时方向，但收紧文案：

- 用户不需要看见 transform 引擎
- 只在高级日志、调试面板、桥接规则管理面里展示“本次写入使用了 source -> target bridge”

---

## 八、数据与运行时契约

### 8.1 层的职责

层只负责：

- `languageId`
- `orthographyId`
- 该层自己的文本内容

### 8.2 transform 的职责

transform 只负责：

- 定义 source orthographyId -> target orthographyId 的改写规则
- 在写入目标层之前生成一份目标文本表示

### 8.3 来源保留契约

除非用户明确发起“覆盖来源文本”类操作，否则：

- 来源文本必须保留
- transform 不得原地覆盖来源层文本

### 8.4 运行时默认顺序

建议统一为：

1. 确认目标层
2. 确认目标层 orthographyId
3. 解析来源 orthographyId
4. 若 source 与 target 相同，则直接写入
5. 若不同且存在 active bridge，则对目标写入结果应用 bridge
6. 若不同但不存在 bridge，则保留原文写入或提示用户选择策略

---

## 九、分阶段落地建议

### Phase 1：产品语义收口

目标：先把用户看见的心智改对。

包含：

- 新建层面板隐藏 transform 默认区
- 文案统一改成“桥接规则”或“导入/写入桥接规则”
- 导入流程增加“保留原文 / 转换后写入 / 同时保留”策略文案

建议入口文件：

- `src/components/ProjectSetupDialog.tsx`
- `src/components/LayerActionPopover.tsx`
- `src/components/OrthographyTransformManager.tsx`
- `src/i18n/projectSetupDialogMessages.ts`
- `src/i18n/layerManagerPopoverMessages.ts`
- `面板—极简.pen`

### Phase 2：运行时策略收口

目标：让所有桥接写入都遵守同一个合同。

包含：

- AI 写回
- assistant 写回
- 语音听写 fallback 写回
- 导入写入
- 跨层复制 / 派生写入

统一遵守“只改目标写入结果，不改来源原文”。

建议入口文件：

- `src/utils/orthographyRuntime.ts`
- `src/pages/useTranscriptionAiController.ts`
- `src/pages/voiceDictationRuntime.ts`
- `src/hooks/useImportExport.importHandlers.ts`
- `src/hooks/useAiToolCallHandler.segmentAdapter.ts`
- 相关回归测试文件

### Phase 3：高级入口收口

目标：把 transform 从主流程移到高级路径。

包含：

- 正字法详情页管理 bridge
- 导入高级设置管理 bridge
- 保留调试与预览能力，但不让普通用户先碰到 engine 细节

说明：

- 若当前版本尚无完整“正字法详情页”，则先把桥接规则管理降级挂在正字法编辑器高级区
- 等正字法管理页独立后，再把桥接规则从建层弹窗完全迁出

当前状态补充：

- 已将“词典”主导航保留在 `/lexicon`，恢复为词典规划/占位页
- 当前层检视器里的桥接入口已迁移为跳转到 `/lexicon/orthographies` 正字法工作台，并携带 `orthographyId`
- 工作台页当前已提供“正字法列表 + 可编辑正字法详情/目录审校状态 + 写入桥接规则”三段式结构
- 详情编辑已接入 `updateOrthography(...)`，可直接保存名称、脚本、方向、字表示例、字体、输入提示、normalization / collation、转换规则 JSON 与备注等字段
- 工作台已补未保存切换/离开保护：切换目标正字法或返回其他工作台前会先确认脏草稿
- 页面级回归已覆盖“从侧栏带 `fromLayerId` 跳入工作台 + 编辑后切换正字法确认”路径

### Phase 4：导入策略显式化

状态：已落地。

目标：把“是否保留来源文本”从隐式行为升级为用户可见策略。

包含：

- 导入弹窗已新增写入策略选项
- 默认选中“原文与转换结果同时保留”
- 已提供“仅保留原文 / 仅写入目标表示 / 原文与目标表示同时保留”三种显式策略
- import runtime 已按策略分支创建 source-preservation layer，并在 bridge tier contract 中持久化 `orthographyId`
- 导入行为测试已覆盖 preserve-source 与 preserve-source-and-transform

建议入口文件：

- `src/hooks/useImportExport.ts`
- `src/hooks/useImportExport.importHandlers.ts`
- 导入相关 UI 组件
- 导入行为测试

---

## 十、推荐最终形态

最终推荐的产品形态如下：

1. 普通用户只需要理解“层有自己的正字法”
2. 用户没有合适正字法时，直接新建正字法
3. transform 不再作为建层主流程的一部分
4. 当文本从别处流入目标层时，系统才按桥接规则决定是否转换
5. 来源文本默认保留，目标层保存自己的目标表示
6. 导入时显式给出“保留原文 / 转换写入 / 同时保留”三种策略

这是当前最符合用户直觉、也最能减少误解的方案。

---

## 十一、建议采纳项

建议优先采纳以下 5 条：

1. 建层主流程默认隐藏 transform 管理
2. 把 transform 的产品文案改为“桥接规则”
3. 明确 contract：transform 只影响目标写入结果，不覆盖来源文本
4. 导入弹窗增加“保留来源文本”策略
5. 将 transform 管理迁移到正字法详情页或高级入口

如果这 5 条确认通过，再进入实现阶段。

---

## 十二、已确认后的建议执行顺序

既然三项关键决策已经确认，建议实现顺序固定为：

1. 先做 Phase 1
   - 这是用户最容易直接感知的认知修正
   - 风险最低，且能立刻减少误解

2. 再做 Phase 2
   - 用统一 contract 收紧所有桥接写入路径
   - 避免“UI 说保留来源，运行时却偷偷覆盖”的行为分裂

3. 然后做 Phase 4
   - 把导入策略做成显式产品能力
   - 这是“保留来源文本”承诺真正落地的关键

4. 最后做 Phase 3
   - 把桥接规则彻底迁出主流程
   - 作为结构治理收尾项

原因：

- 先改入口认知，再改运行时合同，最后整理高级入口，返工最少
- 导入策略只有在 Phase 2 contract 清晰后，才适合彻底外显

---

## 十三、2026-04-04 实施进度同步

截至当前仓库状态，以下收口项已经落地：

### 已完成的能力与交互收敛

1. 正字法 identity 规范化与重复身份拦截
   - 新建正字法会规范化 `languageId / scriptTag / localeTag / regionTag / variantTag`
   - 同身份正字法会在写入前被拒绝

2. built-in 正字法来源与审校状态元数据
   - 已补 `catalogMetadata`
   - 已区分 user / built-in-reviewed / built-in-generated
   - 已支持 verified-primary / verified-secondary / historical / needs-review 等状态

3. 正字法显式分组与状态标签
   - 选择器已按审校状态与来源分组
   - 当前选中正字法已显示显式状态 badge

4. ICU 规则运行时链路与语法提示
   - `icu-rule` 已不再只是标签语义
   - 运行时已支持顺序规则链、正则替换、规范化指令
   - UI 已补引擎级 placeholder 与语法提示

5. 桥接规则管理器 i18n 收口
   - 旧 `OrthographyTransformManager` 历史文案已完成迁移，当前以 `OrthographyBridgeManager` 为唯一入口

6. 建层主流程默认移除 transform 管理
   - `ProjectSetupDialog` 不再在主流程中展示 transform 管理区
   - `LayerActionPopover` 的新建转写层 / 新建翻译层主流程不再展示 transform 管理区
   - 当前主流程只保留语言、正字法与内嵌新建正字法

7. bridge runtime contract 与高级入口收口
   - AI 写回与语音听写已共享“未显式选层时回退到首个 transcription orthography”的 helper
   - 当前层详情卡已改为跳转到独立“正字法工作台”高级入口
   - 正字法工作台已迁移到 `/lexicon/orthographies`，集中承载目标正字法概览、完整元数据、目录审校状态与写入桥接规则
   - `/lexicon` 主路由已重新保留给后续词典工作台开发，避免信息架构冲突
   - import 路径已具备 source -> target bridge 回归覆盖

8. 导入策略显式化与 source layer 持久化
   - `LeftRailProjectHub` 已新增标注导入写入策略对话框
   - `useImportExport` 已支持 preserve-source / transform-target / preserve-source-and-transform 三种策略
   - layer↔tier bridge contract 已补齐 `orthographyId`，source-preservation layer 可稳定 round-trip

### 当前与原方案的对应关系

- 统一结论（2026-04-04 复核）
   - Phase 1/2/3/4 的功能与交互主路径均已落地
   - 决策 B 的内部工程命名治理已完成，不再保留旧 `transform` 兼容命名
   - 本段口径已替换此前“已部分落地 / 持续落地中”等过渡表述，后续评审以本段为准

- 决策 A：已落地
   - 项目创建、新建转写层、新建翻译层主流程已默认移除 transform 管理
   - 当前层详情卡已补独立桥接入口，并已迁移到正字法工作台页，主流程与高级入口已完成分离

- 决策 B：已落地（用户入口 + 工程命名）
   - 用户入口文案已统一到“桥接规则”
   - 组件、导入策略、runtime helper 与 AI 写入回调已统一迁移到 `bridge*` 命名
   - 旧 `transform` 兼容别名已移除

- 决策 C / D：已基本落地
   - 当前 runtime 已按 source -> target 的目标写入链路执行
   - AI / assistant / import 已有聚焦回归覆盖关键 bridge contract

- 决策 E：已落地
   - 导入流程已正式产品化为“保留原文 / 转换后写入 / 同时保留”显式策略
   - preserve-source 相关导入层已能通过 bridge tier round-trip 保留 `orthographyId`

### 当前建议的下一步

1. 后续深化方向
   - 若继续增强审校流程，仍应在当前工作台里继续扩展审核态、来源对比和批量校验，而不是新开另一套并行入口

---

## 十四、决策 B 完成记录（2026-04-04）

### 14.1 已完成项

1. 组件与消息命名已完成
   - `OrthographyBridgeManager` 与 `orthographyBridgeManagerMessages.ts` 已成为唯一入口
   - 旧 `OrthographyTransformManager` 文件与兼容导出已移除

2. 导入策略命名已完成
   - 类型：`AnnotationImportBridgeStrategy`
   - 默认常量：`DEFAULT_ANNOTATION_IMPORT_BRIDGE_STRATEGY`
   - helper：`shouldWriteBridgedTargetText(...)`
   - 策略值：`preserve-source` / `bridge-target` / `preserve-source-and-bridge`

3. runtime helper 与 AI 回调命名已完成
   - `applyOrthographyBridgeIfNeeded(...)`
   - `bridgeTextForLayerTarget(...)`
   - `bridgeVoiceDictationText(...)`
   - `bridgeTextForLayerWrite(...)`
   - 旧 `transform*` 兼容别名已移除

### 14.2 验收结果

1. 目标回归测试：通过（86/86）
2. TypeScript 全量检查：通过（`npm run typecheck`）

### 14.3 当前状态

决策 B 已从“待推进”更新为“已落地（命名治理完成）”。