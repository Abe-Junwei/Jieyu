import { preloadLocaleDictionary } from '../i18n';

/**
 * B-1：Vitest 下许多用例直接 `t('en-US', …)` 或读取 `dictionaries`；
 * `preloadLocaleDictionary('en-US')` 会先拉 `zh-CN` 再拉 `en-US`，避免异步词表未就绪导致断言失败。
 */
await preloadLocaleDictionary('en-US');
