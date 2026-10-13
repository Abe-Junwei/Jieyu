/**
 * Host 头校验：防 DNS rebinding，只接受本机名（及显式配置的绑定地址）
 * Host header guard against DNS rebinding: only loopback names (plus an explicitly configured bind host).
 */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

/**
 * @param {string | undefined} hostHeader e.g. "localhost:3040"
 * @param {string} [bindHost] WHISPER_HOST value; also accepted when not a wildcard
 */
export function isAllowedHostHeader(hostHeader, bindHost = '127.0.0.1') {
  if (typeof hostHeader !== 'string' || hostHeader === '') return false;
  let hostname;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (LOOPBACK_HOSTNAMES.has(hostname)) return true;
  const bind = bindHost.toLowerCase();
  return bind !== '0.0.0.0' && bind !== '::' && hostname === bind;
}
