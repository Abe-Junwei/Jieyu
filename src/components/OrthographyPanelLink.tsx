import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { useAssetPanel } from '../contexts/AssetPanelContext';

type OrthographyPanelLinkProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  orthographyId?: string;
  fromLayerId?: string;
  children?: ReactNode;
};

export function buildOrthographyPanelPath({
  orthographyId,
  fromLayerId,
}: {
  orthographyId?: string;
  fromLayerId?: string;
} = {}): string {
  const params = new URLSearchParams();

  if (orthographyId) {
    params.set('orthographyId', orthographyId);
  }

  if (fromLayerId) {
    params.set('fromLayerId', fromLayerId);
  }

  const search = params.toString();
  return search ? `/assets/orthographies?${search}` : '/assets/orthographies';
}

export function OrthographyPanelLink({
  orthographyId,
  fromLayerId,
  children,
  onClick,
  ...buttonProps
}: OrthographyPanelLinkProps) {
  const ctx = useAssetPanel();

  if (!ctx) {
    // 不在 AssetPanelProvider 内时降级为普通链接 | Fallback to anchor outside provider
    return (
      <a
        {...(buttonProps as unknown as AnchorHTMLAttributes<HTMLAnchorElement>)}
        href={buildOrthographyPanelPath({
          ...(orthographyId !== undefined && { orthographyId }),
          ...(fromLayerId !== undefined && { fromLayerId }),
        })}
        onClick={onClick as AnchorHTMLAttributes<HTMLAnchorElement>['onClick']}
      >
        {children}
      </a>
    );
  }

  const panelPath = buildOrthographyPanelPath({
    ...(orthographyId !== undefined && { orthographyId }),
    ...(fromLayerId !== undefined && { fromLayerId }),
  });

  return (
    <button
      {...buttonProps}
      type="button"
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) {
          return;
        }
        ctx.openPanel(panelPath);
      }}
    >
      {children}
    </button>
  );
}