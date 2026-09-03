import { useEffect, useState } from 'react';
import { getDefaultAgentUiEventBus, type AgentUiEvent } from '../../ai/runtime/agentUiEvents';
import { featureFlags } from '../../ai/config/featureFlags';

/**
 * Latest A11 HITL event for the chat alerts surface. No-ops when the preview flag is off.
 */
export function useAgentUiEvents(): AgentUiEvent | null {
  const enabled = featureFlags.aiAgentUiPreviewEnabled;
  const [latest, setLatest] = useState<AgentUiEvent | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLatest(null);
      return;
    }
    return getDefaultAgentUiEventBus().subscribe((event) => {
      setLatest(event);
    });
  }, [enabled]);

  return enabled ? latest : null;
}
