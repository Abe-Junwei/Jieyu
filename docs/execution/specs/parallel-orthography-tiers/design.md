---
title: parallel-orthography-tiers design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-11-24
source_of_truth: parallel-orthography-tiers-spec
depends_on:
  - ./requirements.md
---

# Design — parallel-orthography-tiers

## 1. 成熟方案扫描 / Research（承接工作流 §5.1.5）

- 仓库既有最相似的模式：`symbolic-association` 读宿主 `units`，正文在 `unit_texts`（`src/db/desktop/units.ts` 的 `listUnits`）。翻译层和录音层已经这么挂。
- 同类产品：ELAN Symbolic Association 是父标注与引用标注一对一、引用层没有自己的时间（MPI 手册 Basic Information）。Praat 各层自带区间。EXMARaLDA 共用时间线，但各层跨度不必相同。
- 业内 best practice：时间继承用这一对一引用。ELAN 把引用层写成 dependent，并在删父层时连带删子层。
- 公认不可行：新建独立 `time-aligned` 转写层；把翻译层改名；用 Time Subdivision 或 Symbolic Subdivision；放宽「时间对齐转写层不能挂宿主」。
- 潜在的坑：`setHosts` 不看宿主层类型；合并会把草稿写成正式正文；`removeUnit` 只认 unit id；拆分草稿只消费当前层。
- 决定：**适配**。不新增层类型，不复制 unit。内容类型保持 `transcription`。删层级联、草稿提交和删一格由解语的操作合同定，不照搬 ELAN。

## 2. 架构选择

- 落位类别：`actions` 为主。建层、宿主、合并、拆分、清空都在现有数据库写路径。界面只组确认框和菜单。
- 选写入处拒绝，不升 SQLite `user_version`。格式已冻结，触发器改了也到不了已打开的库。
- 拒绝新表、新层类型、feature flag。半开开关会让同一库里两种删除语义并存。

## UI 精稿对照

- 对应 DESIGN.md「反馈与阻断」：高风险确认默认聚焦取消。时间主人用文字标出，不用新的分类色。
- Pixso 文件 `va44BZLBUSYRQ7KoiO3PJw`，页「精稿」。2026-11-24 读过画板。新建入口沿用「新建层 · 三案」（`88:569`）的菜单项。合并沿用「01 转写 · 交互 · 合并确认」（`111:1`）。删除沿用「01 转写 · 交互 · 删除确认」（`73:4923`）。
- 菜单和确认框复用既有外壳；层列表本身也需修改排列与标识。没有「共用语段组」整页精稿，不新做分栏，不新做对话框外壳。平级是正字法层不再缩进到锚点下面。
- 2026-11-24 已补局部状态稿：`115:1208`「两组平级写法」、`115:1219`「合并草稿确认」、`115:1223`「拆分后草稿冲突」。初版文字草图被指出未使用设计系统，已原位重做；原先的继续指令不作为初版视觉质量通过的证据。重做使用组件页 ListRow、ContextHeader、MenuItem、IconButton、Button、Input 和 StatusChip 实例；模态外壳由 Modal 组件实例脱离后扩展内容区，保留变量与内部按钮/输入组件实例，不修改主组件。取消/保留草稿用 focus 变体，覆盖和合并用 primary；空格不再用于排控件。三张截图已逐张核对，后续 Electron 合并/冲突实运行截图亦已检查。
- 手测回归：时间轴平级写法保留宿主关系，树线沿既有左侧干线接到下层圆点；名称不恢复缩进。按宿主关系判断组内连续行，不能仅依赖视觉缩进深度。按 Pixso「层树·关系线 v2」（81:4474）沿宿主圆点列连续绘制，短接停在子圆点前 4px；不使用行交界的阶梯横线。正字法平级关系单独共用左侧关系列。
- 用户澄清：译文的树干线应向右缩进一档，不能只移动圆点或层名文字；正字法与时间主人共用同一列树干线；不将译文纳入平级写法。重复创建语音/口译层沿用现有阻断规则，但提示已有同类层，避免笼统的操作未完成。
- 有意留白：换时间主人、从 IPA 生成正文，都不画、不做。

## 3. 落位清单（与 requirements §4 对应）

| 文件 | 职责（一句话） | 复杂度估计（行 / hooks） |
| --- | --- | --- |
| `src/pages/desktopTranscriptionLayerCommands.ts` | 组装正字法层的创建参数和当前锚点 | 纯函数 |
| `src/db/desktop/layerHosts.ts` | 宿主必须是时间对齐转写层；转写内容的符号关联层最多一个宿主 | 现有函数内 |
| `src/pages/desktopTranscriptionLayerDrop.ts` | 落点同样拒绝非时间对齐宿主 | 纯函数 |
| `src/db/desktop/unitMergeWrite.ts`（经 `unitMerge.ts` 再导出） | 未确认时不把草稿写入正式正文 | 现有函数内 |
| `src/db/desktop/unitSplit.ts` | 其他层按正式正文切，草稿整段留左 | 现有函数内 |
| `src/db/desktop/layerStructure.ts` | 三种删层模式统一保护锚点，核对恢复与清除 | 现有函数内 |
| `src/db/desktop/operationContract.ts`、`desktopCall.ts`、`sessionEdit.ts` | 清空协议、回执、撤销及冲突校验 | 现有模块 |
| `src/pages/desktopTranscriptionEdgeActions.ts`、`useDesktopTranscriptionEdgeController.ts` | 单条、批量删除预览与按层路由 | 既有边界 |
| `src/pages/useDesktopTranscriptionSplitController.tsx`、`useDesktopTranscriptionMergeController.tsx`、`useDesktopProjectReadController.ts`、`src/db/desktop/textSave.ts` | 确认快照与草稿冲突展示、保存阻断 | 既有边界 |
| `src/pages/DesktopTranscriptionLayerList.tsx`、`DesktopTranscriptionLayerLabel.tsx` | 平级排列及时间主人文字 | 既有组件 |
| `src/db/desktop/unitEdges.ts` | 按层清空一格，不删共享 unit | 现有文件内 |
| `src/services/eaf/eafExportAdditionalTiers.ts` | 空正文也写出一条引用标注 | 现有函数内 |
| `src/pages/useDesktopTranscriptionLayerController.ts` | 把新入口接到上面的纯函数 | 不增加 hook，总行数保持 < 300 |

### 操作合同与数据流

1. **删层保护**：在 `layerStructure.ts::deleteLayer` 的事务内、任何写入及模式分支之前检查有效正字法依赖；普通删除、purge、migrate 同样拒绝，不用 UI 禁用代替。空正文不豁免。软删除正字法层后再删锚点沿用保留期机制；恢复必须检查宿主有效性，清除沿用后代收集，不能留下有效悬挂层。层删除预览展示阻断原因。
2. **按层清空**：沿现有 `operationContract → desktopCall → unitEdges → sessionEdit → reload` 接线，新增单格/批量清空操作，显式携带 `textLayerId`、unit 身份及 `operationId`。服务端验证文本层、宿主归属和有效状态。回执摘要包含层身份与确认指纹；同次请求重放不重复写入或入撤销栈。预览和执行使用同一范围，确认后内容变化则拒绝。单次批量一次事务；撤销捕获该层正式正文、来源和草稿，并检查执行后的状态，拒绝覆盖后续编辑。清空不调用 `deleteUnitTree`，不删除共享 unit、其他层内容及其录音/笔记；本层已有录音/笔记也保留，必要的空正文承载行沿用现有约束。键盘、波形菜单、单选和多选都由当前层路由，关联文字层走清空，时间锚点走现有整段删除。
3. **拆分与草稿冲突**：各层切正式正文，未指定切点整段留左；草稿 `raw_input/base_body/provenance` 原样移左。基线不同时是待处理冲突，不能自动重设基线。重开后仍呈现原草稿和当前正式正文。用户可保留冲突或舍弃草稿；显式确认“用整段草稿覆盖左段”后，按本层保存回执提交并消费该草稿，明确提示右段仍保留。未确认时普通/自动保存和再次拆分均阻断该冲突，不放宽全局并发保护。撤销需校验本层状态；确认期间任一参与层正文或草稿变化，整次拆分拒绝。当前层已有草稿也不得由旧 `sourceText` 默认消费绕过此合同。
4. **合并**：预览分列每层正式正文、草稿及最终结果；确认授权只对应冻结的整组输入。确认前任一参与层正文或草稿变化则重新预览，不能提交未展示的草稿。沿用现有事务、回执和撤销。
5. **EAF**：为符号关联转写显式选择引用标注分支，不能只移除空字符串过滤。先为各时间宿主生成完整父标注（包括空正文），按 `(hostLayerId, unitId)` 建映射；再输出 `TIME_ALIGNABLE=false` 的 Symbolic Association 类型、正确 `PARENT_REF` 及每段一条 `REF_ANNOTATION`。缺宿主映射时明确失败，不退到默认转写层。保持其他转写及翻译分支既有行为。
6. **EAF 范围修订（2026-11-24 用户确认）**：本片只完善 EAF 序列化，桌面入口另做。`exportToEaf` 的旧浏览器调用不作为桌面交付证据；不新增 SQLite 适配或导出 UI。测试从两套宿主及其空正文输入解析 EAF XML，核对引用、父层与空标注。
7. **实际落位补充**：按层清空的快照、指纹和恢复独立在 `src/db/desktop/unitTextClear.ts`，由现有 `units.delete/deleteMany` 在携带 `textLayerId + fingerprint` 时分派，回执仍用既有 kind，摘要带层身份；无层参数仍为整段删除。拆分预览/切点校验在 `unitSplitTextPlan.ts`；页面通过 `src/app/desktopProjectReadPageAccess.ts` 取得类型。草稿冲突局部状态放在 `src/desktop/useDesktopDraftConflict.ts`，保存防线在 `units.ts`，确认覆盖后的草稿撤销由 `analysisRestore.ts` 恢复。两个新增页面对话框只渲染确认字段，复用 `ModalPanel`。


约束自查：

- [x] 单 hook 行数 < 300，`useEffect/useMemo/useCallback` 总数 < 12
- [x] 编排层只组装 / 透传 / 绑事件
- [x] 不引入 `src/features/…`
- [x] 面板 CSS 双层边框规则（本片不加面板边框）

## 4. ADR 引用

- 相关 ADR：[ADR-0085](../../../adr/0085-desktop-project-one-sqlite.md)、[ADR-0132](../../../adr/0132-layer-scoped-transcription-and-legacy-create-routing.md)、[ADR-0138](../../../adr/0138-layer-display-style.md)
- 是否需要新建 ADR？否。没有新的存储技术或对外协议。

## 5. Feature flag（如启用）

- 不启用。删除和合并的语义必须全开或全关，不能按开关分叉。

## 6. 失败模式 / 兼容性

- 时间对齐转写层保留整段删除；翻译层删除改为按层清空，属于本片明确的行为变更。正字法层是新创建的层。
- 无数据迁移。直接写 SQL 仍可插入不合规则的宿主链接；产品入口走 `insertHostLinks`。
- 停用新建入口不等于回滚删除语义；已存在关联层仍须按层清空并保护时间锚点。已创建的层仍是合法的符号关联转写层。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/db/desktop/layerHosts.test.ts src/db/desktop/unitMerge.test.ts src/db/desktop/unitSplit.test.ts src/db/desktop/unitEdges.test.ts src/pages/desktopTranscriptionLayerDrop.test.ts src/services/EafExportBehavior.test.ts` | all pass |
| 结构守卫 | `npm run check:architecture-guard` | OK |
| 桌面流程 | `npm run test:e2e:desktop-project -- --grep "正字法转写"` | green |
| 文档 | `npm run check:docs-governance` | OK |

- 2026-11-24 按用户指定读取 v2 的 A/B/C 状态与度量：16px 分级、6px 节点、1px 淡线、横接留 4px；第二宿主继续复用既有侧槽与收起停靠。树干线按宿主与分支级别贯穿子树，不随相邻行变成阶梯。
