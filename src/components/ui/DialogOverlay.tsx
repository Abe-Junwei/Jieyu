import type { HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { joinClassNames } from './classNames';

interface DialogOverlayProps extends HTMLAttributes<HTMLDivElement> {
  /** 关闭回调 | Close handler triggered on backdrop interaction */
  onClose: () => void;
  /** 是否置顶（加 dialog-overlay-topmost） | Whether to add topmost z-index class */
  topmost?: boolean;
  /**
   * 关闭触发事件 | Which mouse event triggers close
   * - 'click'：onClick（默认）
   * - 'mousedown'：onMouseDown（更早触发，阻止焦点转移）
   */
  closeOn?: 'click' | 'mousedown';
  children: ReactNode;
}

/**
 * 对话框/弹层背景遮罩 | Dialog / popover backdrop overlay
 *
 * 封装 dialog-overlay + click-outside-close 逻辑，
 * 替代 15+ 处手写遮罩代码。
 *
 * Encapsulates dialog-overlay CSS class + click-outside-close logic,
 * replacing 15+ hand-written overlay patterns.
 */
export function DialogOverlay({
  onClose,
  topmost = false,
  closeOn = 'click',
  className,
  children,
  ...rest
}: DialogOverlayProps) {
  const handleInteraction = (e: MouseEvent<HTMLDivElement>) => {
    // 仅在点击遮罩本身时关闭，不拦截子元素事件 | Only close when backdrop itself is clicked
    if (e.target === e.currentTarget) onClose();
  };

  const interactionProps = closeOn === 'mousedown'
    ? { onMouseDown: handleInteraction }
    : { onClick: handleInteraction };

  return (
    <div
      className={joinClassNames(
        'dialog-overlay',
        topmost && 'dialog-overlay-topmost',
        className,
      )}
      role="presentation"
      {...interactionProps}
      {...rest}
    >
      {children}
    </div>
  );
}
