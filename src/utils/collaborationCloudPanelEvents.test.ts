// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  addCollaborationCloudPanelOpenListener,
  consumePendingCollaborationCloudPanelOpen,
  requestCollaborationCloudPanelOpen,
} from './collaborationCloudPanelEvents';

describe('collaborationCloudPanelEvents', () => {
  it('keeps an open request pending until the side pane listener can consume it', () => {
    requestCollaborationCloudPanelOpen(window);

    expect(consumePendingCollaborationCloudPanelOpen(window)).toBe(true);
    expect(consumePendingCollaborationCloudPanelOpen(window)).toBe(false);
  });

  it('clears pending state when a registered listener handles the open event', () => {
    const handler = vi.fn();
    const cleanup = addCollaborationCloudPanelOpenListener(window, handler);

    requestCollaborationCloudPanelOpen(window);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(consumePendingCollaborationCloudPanelOpen(window)).toBe(false);
    cleanup();
  });
});
