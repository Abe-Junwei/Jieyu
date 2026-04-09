import type { AnchorHTMLAttributes } from 'react';
import { Link, useInRouterContext, useLocation, type LinkProps, type Location } from 'react-router-dom';

type LanguageAssetRouteLinkProps = Omit<LinkProps, 'state'> & {
  state?: LinkProps['state'];
};

export function LanguageAssetRouteLink({
  state,
  ...linkProps
}: LanguageAssetRouteLinkProps) {
  const inRouterContext = useInRouterContext();

  if (!inRouterContext) {
    const href = typeof linkProps.to === 'string' ? linkProps.to : '#';
    const {
      to: _to,
      replace: _replace,
      reloadDocument: _reloadDocument,
      preventScrollReset: _preventScrollReset,
      relative: _relative,
      viewTransition: _viewTransition,
      discover: _discover,
      prefetch: _prefetch,
      ...anchorProps
    } = linkProps as LanguageAssetRouteLinkProps & Record<string, unknown>;

    return <a {...(anchorProps as AnchorHTMLAttributes<HTMLAnchorElement>)} href={href} />;
  }

  return <LanguageAssetRouteRouterLink {...linkProps} state={state} />;
}

function LanguageAssetRouteRouterLink({
  state,
  ...linkProps
}: LanguageAssetRouteLinkProps) {
  const location = useLocation();
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation ?? location;
  const nextState = state && typeof state === 'object'
    ? { ...(state as Record<string, unknown>), backgroundLocation }
    : { backgroundLocation };

  return <Link {...linkProps} state={nextState} />;
}