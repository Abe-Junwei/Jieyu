// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BUILTIN_HOST_CONTRACTS_EXTENSION_ID } from './builtinHostContractsExtension';
import { ensureBuiltinExtensionsLoaded, getExtensionRegistry } from './extensionRegistrySingleton';

describe('extensionRegistrySingleton', () => {
  it('ensureBuiltinExtensionsLoaded is idempotent', async () => {
    await ensureBuiltinExtensionsLoaded();
    await ensureBuiltinExtensionsLoaded();
    const reg = getExtensionRegistry();
    const ids = reg.list().map((r) => r.id);
    expect(ids.filter((id) => id === BUILTIN_HOST_CONTRACTS_EXTENSION_ID).length).toBe(1);
  });
});
