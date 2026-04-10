import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { useAssetPanel } from '../contexts/AssetPanelContext';

interface LanguageAssetRouteLinkProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** 目标面板路径 | Target panel path, e.g. '/assets/language-metadata' */
  to: string;
  children?: ReactNode;
}

export function LanguageAssetRouteLink({
  to,
  children,
  onClick,
  ...buttonProps
}: LanguageAssetRouteLinkProps) {
  const ctx = useAssetPanel();

  if (!ctx) {
    // 不在 AssetPanelProvider 内时降级为普通链接 | Fallback to anchor outside provider
    const { ...rest } = buttonProps as unknown as AnchorHTMLAttributes<HTMLAnchorElement>;
    return <a {...rest} href={to} onClick={onClick as AnchorHTMLAttributes<HTMLAnchorElement>['onClick']}>{children}</a>;
  }

  return (
    <button
      {...buttonProps}
      type="button"
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) {
          return;
        }
        ctx.openPanel(to);
      }}
    >
      {children}
    </button>
  );
}