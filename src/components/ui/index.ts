/**
 * 面板 UI 组件统一入口 | Panel UI components barrel export
 *
 * 新建面板/弹窗时从此入口导入所有基础组件：
 * import { PanelButton, PanelChip, DialogShell, DialogOverlay } from '@/components/ui';
 *
 * Import all foundation components from this barrel when building new panels/dialogs.
 */

// ── 布局骨架 | Layout shells ──
export { DialogShell } from './DialogShell';
export { EmbeddedPanelShell } from './EmbeddedPanelShell';
export { DialogOverlay } from './DialogOverlay';
export { ModalPanel } from './ModalPanel';

// ── 结构组件 | Structural components ──
export { PanelSection } from './PanelSection';
export { PanelSummary } from './PanelSummary';

// ── 原子组件 | Atomic components ──
export { PanelButton } from './PanelButton';
export type { PanelButtonVariant, PanelButtonSize } from './PanelButton';
export { PanelChip } from './PanelChip';
export type { PanelChipVariant } from './PanelChip';
export { PanelNote } from './PanelNote';
export type { PanelNoteVariant } from './PanelNote';
export { PanelFeedback, PanelFeedbackStack } from './PanelFeedback';
export type { PanelFeedbackLevel } from './PanelFeedback';

// ── 复合组件 | Composite components ──
export { FormField } from './FormField';
export type { FormFieldSpan } from './FormField';
export { ActionButtonGroup } from './ActionButtonGroup';
export type { ActionButtonGroupAlign } from './ActionButtonGroup';
export { PanelStateDisplay } from './PanelStateDisplay';
export type { PanelStateVariant } from './PanelStateDisplay';

// ── 图标 | Icons ──
export { MaterialSymbol } from './MaterialSymbol';
export type { MaterialSymbolProps } from './MaterialSymbol';
export type { LeftRailNavIconName } from '../../utils/jieyuMaterialIcon';
export type { LeftRailLottieMaterialName } from '../../assets/lottie/left-rail/leftRailLottieMap';

// ── 工具函数 | Utilities ──
export { joinClassNames } from './classNames';
