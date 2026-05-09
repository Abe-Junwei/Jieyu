/**
 * E2E pageerror 公共过滤器
 * 统一过滤已知的无害错误，避免各 spec 重复维护过滤逻辑。
 */

const KNOWN_HARMLESS_ERRORS: RegExp[] = [
  // ResizeObserver loop limit exceeded — 浏览器标准行为，非 bug
  /ResizeObserver loop limit exceeded/i,
  // WebGL context lost — 常见于标签页切换或资源回收
  /WebGL context lost/i,
  // AbortError — 请求被取消（如组件卸载时）
  /AbortError/i,
  // 网络相关取消
  /The user aborted a request/i,
];

/**
 * 注册 pageerror 监听器，自动过滤已知无害错误。
 * 返回错误收集数组，供断言使用。
 */
export function trackPageErrors(
  page: { on: (event: 'pageerror', handler: (err: Error) => void) => void }
): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err: Error) => {
    const message = err.message ?? String(err);
    const isHarmless = KNOWN_HARMLESS_ERRORS.some((pattern) => pattern.test(message));
    if (!isHarmless) {
      errors.push(message);
    }
  });
  return errors;
}
