export function readMapProxyBaseUrl(): string {
  const configured = import.meta.env.VITE_MAP_PROXY_BASE_URL?.trim();
  if (!configured) {
    return '';
  }
  return configured.replace(/\/+$/, '');
}

export function buildMapProxyUrl(pathname: string, params?: URLSearchParams): string | null {
  const baseUrl = readMapProxyBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const query = params?.toString();
  return query && query.length > 0
    ? `${baseUrl}${normalizedPath}?${query}`
    : `${baseUrl}${normalizedPath}`;
}
