/** Desktop renderer CSP. connect-src stays on this machine. */
export const DESKTOP_CSP =
  "base-uri 'none'; object-src 'none'; frame-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' http://127.0.0.1:* http://localhost:* jieyu-media:";
