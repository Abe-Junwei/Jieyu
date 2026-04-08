import type { HTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './classNames';

/**
 * 反馈消息级别 | Feedback message severity level
 */
export type PanelFeedbackLevel = 'error' | 'warn' | 'info';

interface PanelFeedbackProps extends HTMLAttributes<HTMLParagraphElement> {
  level: PanelFeedbackLevel;
  children: ReactNode;
}

/**
 * 面板反馈消息组件 | Panel inline feedback / validation message
 *
 * 自动拼接 panel-feedback / panel-feedback--{level} 类名。
 * Automatically composes panel-feedback CSS classes from level prop.
 */
export function PanelFeedback({
  level,
  className,
  children,
  ...rest
}: PanelFeedbackProps) {
  return (
    <p
      className={joinClassNames(
        'panel-feedback',
        `panel-feedback--${level}`,
        className,
      )}
      {...rest}
    >
      {children}
    </p>
  );
}

// ── 反馈消息栈 | Feedback message stack ──

interface PanelFeedbackStackProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * 反馈消息栈容器 | Feedback message stack container
 *
 * 包裹多条 PanelFeedback，自动加 panel-feedback-stack 类名。
 * Wraps multiple PanelFeedback items with panel-feedback-stack class.
 */
export function PanelFeedbackStack({
  className,
  children,
  ...rest
}: PanelFeedbackStackProps) {
  return (
    <div
      className={joinClassNames('panel-feedback-stack', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
