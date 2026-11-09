import type { SVGProps } from 'react';
import { resolveJieyuIcon, type JieyuIconName } from '../../utils/jieyuIcon';

export type JieyuIconProps = {
  /** Lucide 图标名（PascalCase），如 Play、Settings */
  name: JieyuIconName | (string & {});
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, 'children' | 'ref' | 'name'>;

/**
 * App 图标入口 — Lucide（lucide-react）。
 */
export function JieyuIcon({ name, className, 'aria-hidden': ariaHidden, ...rest }: JieyuIconProps) {
  const Icon = resolveJieyuIcon(name);
  return (
    <Icon
      {...rest}
      aria-hidden={ariaHidden ?? true}
      data-jieyu-spin={name === 'Loader2' ? '1' : undefined}
      className={['jieyu-icon', className].filter(Boolean).join(' ')}
    />
  );
}
