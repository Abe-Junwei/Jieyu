import { Link, useInRouterContext, useLocation, type LinkProps, type Location } from 'react-router-dom';

type OrthographyPanelLinkProps = Omit<LinkProps, 'to' | 'state'> & {
  orthographyId?: string;
  fromLayerId?: string;
  state?: LinkProps['state'];
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
  state,
  ...linkProps
}: OrthographyPanelLinkProps) {
  const inRouterContext = useInRouterContext();

  if (!inRouterContext) {
    return (
      <a
        {...linkProps}
        href={buildOrthographyPanelPath({ orthographyId, fromLayerId })}
      />
    );
  }

  return (
    <OrthographyPanelRouterLink
      {...linkProps}
      orthographyId={orthographyId}
      fromLayerId={fromLayerId}
      state={state}
    />
  );
}

function OrthographyPanelRouterLink({
  orthographyId,
  fromLayerId,
  state,
  ...linkProps
}: OrthographyPanelLinkProps) {
  const location = useLocation();
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation ?? location;
  const nextState = state && typeof state === 'object'
    ? { ...(state as Record<string, unknown>), backgroundLocation }
    : { backgroundLocation };

  return (
    <Link
      {...linkProps}
      to={buildOrthographyPanelPath({ orthographyId, fromLayerId })}
      state={nextState}
    />
  );
}