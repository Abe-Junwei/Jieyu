# 区块间距统一整改验收（2026-04-26）

## 审计范围
- `src/styles/foundation/panel-primitives.css`
- `src/styles/foundation/panel-design-presets.css`
- `src/styles/foundation/language-asset-section-contract.css`
- `src/styles/panels/settings-modal.css`
- `src/styles/pages/language-metadata-workspace.css`
- `src/styles/pages/orthography-bridge-workspace.css`
- `src/styles/pages/orthography-manager-panel.css`
- `src/styles/panels/analysis-panel.css`
- `scripts/check-css-spacing-contract.mjs`

## 已统一（通过语义 Token）
### A. 基础层 / 契约层
- `panel-primitives` 已使用：`--space-stack-section`、`--space-section-padding`、`--space-title-content`、`--space-row-gap`。
- `panel-design-presets` 已对齐：`.panel-section` 统一消费 `--space-stack-section` / `--space-section-padding`。
- `language-asset-section-contract` 已对齐：`--la-section-gap` 来源于 `--space-stack-page`，Summary/Header/Copy 行为对齐 token。
- `settings-modal` 已对齐：section 堆叠、标题到内容、row 间距全部映射 token，并移除负 margin 特例。

### B. 页面层
- LM：主 section、subsection、subgroup header、matrix、geography header、geocode bar 已对齐 token。
- OB：summary/list/builder group 与 actions 已对齐 token。
- OM：body/browser/form/advanced/basic-grid 等区块节奏已对齐 token。
- Analysis：header/body/tab/stats/acoustic/hotspot/export/footer 等主节奏已对齐 token。

## 保留特例（可接受）
以下项仍为裸值，但当前属于组件微观视觉或交互几何，不直接定义“区块与区块 / 标题到内容”主节奏：
- 小尺寸控件紧凑态、边框分割线、局部 top offset（如个别 `padding-top: 4px`、`margin-top` 微调）
- 部分 compact action group 与特殊工具条微间距
- 局部地图/管理器子组件的微观布局空隙

结论：当前保留项不会破坏主节奏统一目标，可作为下一轮 UI 微调 debt 管理。

## 建议继续收敛（下一轮可选）
1. 对 `padding-top: 4px` / `margin-top: 6px` 这类微调新增二级 token（如 `--space-micro-offset`），避免后续散落。
2. 对 map/admin 子模块建立子域 spacing token，减少局部裸值反复出现。
3. 将 spacing 守卫从“关键片段存在性”升级为“关键选择器禁止裸值”模式（正则白名单）。

## 守卫与验证
- `npm run check:css-spacing-contract`：通过
- `npm run check:css-unused-selectors`：通过
- `npm run build`：通过

## 发布结论
- 结论：**可发布（区块主节奏统一目标已达成）**。
- 风险级别：低。
- 余项：仅剩局部微观间距 debt，不阻断当前发布。