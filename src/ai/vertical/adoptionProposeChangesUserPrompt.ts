import type { AdoptionItem } from './adoptionQueue';

/**
 * User message sent after AdoptionQueue "accept" so the assistant can emit `propose_changes`
 * for human confirmation (no silent writes).
 */
export function buildAdoptionAcceptProposeChangesUserPrompt(item: AdoptionItem, localizedHead: string): string {
  const body = [
    `[workflow] ${item.workflowId}`,
    `[requestId] ${item.requestId}`,
    `[summary]\n${item.summary}`,
    ...(item.rawContent && item.rawContent.trim().length > 0 ? [`[detail]\n${item.rawContent.trim()}`] : []),
  ].join('\n\n');
  return `${localizedHead}\n\n${body}`;
}
