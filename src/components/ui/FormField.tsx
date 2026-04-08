import type { HTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './classNames';

/**
 * 表单字段容器宽度 | Form field width modifier
 */
export type FormFieldSpan = 'full' | 'half' | 'third';

interface FormFieldProps extends HTMLAttributes<HTMLElement> {
  /** 字段标签 | Field label text */
  label?: ReactNode;
  /**
   * 显式关联控件 id | Explicit control id for htmlFor association.
   * 提供时容器渲染为 div + 独立 label；省略时容器渲染为隐式 label 包裹。
   * When provided, container renders as div + explicit label; otherwise implicit label wrapper.
   */
  htmlFor?: string;
  /** 提示文本 | Helper text below the control */
  hint?: ReactNode;
  /** 错误文本（优先于 hint 显示）| Error text (takes priority over hint) */
  error?: ReactNode;
  /** 宽度 | Width modifier */
  span?: FormFieldSpan;
  children: ReactNode;
}

/**
 * 表单字段容器 | Form field wrapper
 *
 * 封装 dialog-field 容器 + 标签 + 控件 + 提示/错误 的通用结构，
 * 替代手动拼接 label + span + input + error 的模式。
 *
 * Wraps the common dialog-field pattern: label + control + hint/error,
 * replacing repetitive manual JSX in panel forms.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  span,
  className,
  children,
  ...rest
}: FormFieldProps) {
  const cls = joinClassNames(
    'dialog-field',
    span && `dialog-field--${span}`,
    className,
  );

  const tail = error != null
    ? <span className="dialog-field-error">{error}</span>
    : hint != null
      ? <span className="dialog-field-hint">{hint}</span>
      : null;

  // 显式 htmlFor → div 容器 + 独立 label | explicit htmlFor → div + separate label
  if (htmlFor) {
    return (
      <div className={cls} {...rest}>
        {label != null && <label htmlFor={htmlFor} className="dialog-field-label">{label}</label>}
        {children}
        {tail}
      </div>
    );
  }

  // 隐式包裹 → label 容器 | implicit wrapping → label container
  return (
    <label className={cls} {...rest}>
      {label != null && <span className="dialog-field-label">{label}</span>}
      {children}
      {tail}
    </label>
  );
}
