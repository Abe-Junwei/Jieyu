import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHasSupabaseBrowserClientConfig, mockCollaborationCloudEnabled } = vi.hoisted(() => ({
  mockHasSupabaseBrowserClientConfig: vi.fn<() => boolean>().mockReturnValue(true),
  mockCollaborationCloudEnabled: vi.fn<() => boolean>().mockReturnValue(true),
}));

vi.mock('../../ai/config/featureFlags', () => ({
  featureFlags: {
    get collaborationCloudEnabled() {
      return mockCollaborationCloudEnabled();
    },
  },
}));

vi.mock('./collaborationSupabaseFacade', () => ({
  hasSupabaseBrowserClientConfig: mockHasSupabaseBrowserClientConfig,
}));

import { isCollaborationCloudSurfaceActive } from './collaborationCloudFeatureGate';

describe('isCollaborationCloudSurfaceActive', () => {
  beforeEach(() => {
    mockHasSupabaseBrowserClientConfig.mockReturnValue(true);
    mockCollaborationCloudEnabled.mockReturnValue(true);
  });

  it('returns true when flag and Supabase config are both enabled', () => {
    expect(isCollaborationCloudSurfaceActive()).toBe(true);
  });

  it('returns false when collaborationCloudEnabled is false', () => {
    mockCollaborationCloudEnabled.mockReturnValue(false);
    expect(isCollaborationCloudSurfaceActive()).toBe(false);
  });

  it('returns false when Supabase browser config is missing', () => {
    mockHasSupabaseBrowserClientConfig.mockReturnValue(false);
    expect(isCollaborationCloudSurfaceActive()).toBe(false);
  });
});
