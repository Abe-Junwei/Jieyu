/**
 * 模态面板 | Modal panel
 *
 * 组合 Portal + DialogOverlay + DialogShell + 标准关闭按钮的高层模板，
 * 替代消费者反复手写 createPortal + overlay + actions 的模式。
 *
 * Higher-level template composing Portal + DialogOverlay + DialogShell
 * + standard close button, replacing the repeated boilerplate in consumers.
 */
import { type ReactNode, type Ref, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DialogOverlay } from './DialogOverlay';
import { DialogShell } from './DialogShell';
import { joinClassNames } from './classNames';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ModalPanelProps {
  /** 是否显示 | Whether the modal is open */
  isOpen: boolean;
  /** 关闭回调 | Close handler */
  onClose: () => void;
  /** 面板标题 | Panel title */
  title?: ReactNode;
  /** 标题右侧额外操作（在关闭按钮左侧）| Extra header actions (left of close button) */
  headerActions?: ReactNode;
  /** 底部区域 | Footer content */
  footer?: ReactNode;
  /** 紧凑/宽模式 | Compact / wide variant */
  compact?: boolean;
  wide?: boolean;
  /** 遮罩置顶 | Topmost overlay */
  topmost?: boolean;
  /** 遮罩关闭触发 | Overlay close trigger */
  closeOn?: 'click' | 'mousedown';
  /** 容器额外类名 | Extra class for the shell */
  className?: string;
  /** body 类名 | Body area class */
  bodyClassName?: string;
  /** header 类名 | Header area class */
  headerClassName?: string;
  /** footer 类名 | Footer area class */
  footerClassName?: string;
  /** 容器 ref | Container ref */
  containerRef?: Ref<HTMLDivElement>;
  /** 内联样式 | Inline style for the shell */
  style?: React.CSSProperties | undefined;
  /** 布局样式宿主 | Layout style host for the shell */
  layoutStyle?: React.CSSProperties | undefined;
  /** 隐藏默认关闭按钮 | Hide the default close button */
  hideCloseButton?: boolean;
  /** 禁用关闭按钮 | Disable the close button */
  closeDisabled?: boolean | undefined;
  /** 关闭按钮无障碍标签 | Close button aria-label */
  closeLabel?: string;
  /** 无障碍标签 | ARIA label for the dialog shell */
  ariaLabel?: string;
  /** 无障碍标签引用 | ARIA labelledby for the dialog shell */
  ariaLabelledBy?: string;
  /** 文本方向 | Text direction (ltr/rtl) */
  dir?: string;
  /** 标题额外类名 | Title area class */
  titleClassName?: string;
  /** 使用不透明遮罩 | Use opaque overlay backdrop */
  opaqueOverlay?: boolean;
  /** 仅使用遮罩与容器，不渲染 DialogShell 可见卡片壳 | Use overlay + host only without rendering visible DialogShell card */
  renderShell?: boolean;
  children: ReactNode;
}

export function ModalPanel({
  isOpen,
  onClose,
  title,
  headerActions,
  footer,
  compact,
  wide,
  topmost = true,
  closeOn,
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
  containerRef,
  style,
  layoutStyle,
  hideCloseButton,
  closeDisabled,
  closeLabel = 'Close',
  ariaLabel,
  ariaLabelledBy,
  dir,
  titleClassName,
  opaqueOverlay = false,
  renderShell = true,
  children,
}: ModalPanelProps) {
  const fallbackRef = useRef<HTMLDivElement>(null);
  const resolvedRef = (containerRef ?? fallbackRef) as React.RefObject<HTMLDivElement>;
  useFocusTrap(resolvedRef, isOpen, onClose);

  if (!isOpen) return null;

  const closeButton = hideCloseButton ? null : (
    <button type="button" className="icon-btn" onClick={onClose} aria-label={closeLabel} title={closeLabel} {...(closeDisabled !== undefined && { disabled: closeDisabled })}>
      <X size={16} />
    </button>
  );

  const actions = headerActions
    ? <>{headerActions}{closeButton}</>
    : closeButton;

  if (!renderShell) {
    return createPortal(
      <DialogOverlay
        onClose={onClose}
        topmost={topmost}
        className={opaqueOverlay ? 'dialog-overlay-opaque' : undefined}
        {...(closeOn !== undefined && { closeOn })}
        {...(dir !== undefined && { dir })}
      >
        <div
          ref={resolvedRef}
          className={joinClassNames(
            'modal-panel-host',
            compact && 'dialog-card-compact',
            wide && 'dialog-card-wide',
            className,
          )}
          style={layoutStyle ?? style}
          {...(dir !== undefined && { dir })}
          {...(ariaLabel !== undefined && { 'aria-label': ariaLabel })}
          {...(ariaLabelledBy !== undefined && { 'aria-labelledby': ariaLabelledBy })}
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </DialogOverlay>,
      document.body,
    );
  }

  return createPortal(
    <DialogOverlay
      onClose={onClose}
      topmost={topmost}
      className={opaqueOverlay ? 'dialog-overlay-opaque' : undefined}
      {...(closeOn !== undefined && { closeOn })}
      {...(dir !== undefined && { dir })}
    >
      <DialogShell
        containerRef={resolvedRef}
        {...(className !== undefined && { className })}
        {...(headerClassName !== undefined && { headerClassName })}
        {...(bodyClassName !== undefined && { bodyClassName })}
        {...(footerClassName !== undefined && { footerClassName })}
        {...(titleClassName !== undefined && { titleClassName })}
        title={title}
        actions={actions}
        footer={footer}
        {...(compact !== undefined && { compact })}
        {...(wide !== undefined && { wide })}
        layoutStyle={layoutStyle ?? style}
        {...(dir !== undefined && { dir })}
        {...(ariaLabel !== undefined && { 'aria-label': ariaLabel })}
        {...(ariaLabelledBy !== undefined && { 'aria-labelledby': ariaLabelledBy })}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </DialogShell>
    </DialogOverlay>,
    document.body,
  );
}
