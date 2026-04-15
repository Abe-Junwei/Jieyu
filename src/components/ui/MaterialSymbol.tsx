import type { HTMLAttributes } from 'react';

export type MaterialSymbolProps = {
  /** Material Symbols 图标名（ligature），如 settings、close、play_arrow */
  name: string;
  className?: string;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

/**
 * [Material Symbols Outlined](https://fonts.google.com/icons) — 需在 `index.html` 加载 Google Fonts 样式表。
 */
export function MaterialSymbol({ name, className, ...rest }: MaterialSymbolProps) {
  return (
    <span
      {...rest}
      className={['material-symbols-outlined', 'jieyu-material', className].filter(Boolean).join(' ')}
    >
      {name}
    </span>
  );
}
