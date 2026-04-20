/**
 * 宿主 semver：与 Vite `define.__APP_VERSION__` 及 `VITE_APP_VERSION` 对齐，供扩展兼容协商与设置 UI。
 * Host semver aligned with Vite-injected __APP_VERSION__ / VITE_APP_VERSION for extension compatibility + settings.
 */
export function resolveHostVersion(): string {
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0) {
    return __APP_VERSION__.trim();
  }
  const fromEnv = import.meta.env.VITE_APP_VERSION?.trim();
  if (fromEnv) return fromEnv;
  return '0.0.0';
}
