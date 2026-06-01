const COLLABORATION_CLOUD_PANEL_OPEN_EVENT = 'jieyu:open-collaboration-cloud-panel';
const COLLABORATION_CLOUD_PANEL_PENDING_KEY = '__JIEYU_COLLABORATION_CLOUD_PANEL_OPEN_REQUESTED__';

type CollaborationCloudPanelEventWindow = Window & {
  [COLLABORATION_CLOUD_PANEL_PENDING_KEY]?: boolean;
};

export function requestCollaborationCloudPanelOpen(target: Window): void {
  const eventWindow = target as CollaborationCloudPanelEventWindow;
  eventWindow[COLLABORATION_CLOUD_PANEL_PENDING_KEY] = true;
  target.dispatchEvent(new Event(COLLABORATION_CLOUD_PANEL_OPEN_EVENT));
}

export function consumePendingCollaborationCloudPanelOpen(target: Window): boolean {
  const eventWindow = target as CollaborationCloudPanelEventWindow;
  const pending = eventWindow[COLLABORATION_CLOUD_PANEL_PENDING_KEY] === true;
  if (pending) {
    eventWindow[COLLABORATION_CLOUD_PANEL_PENDING_KEY] = false;
  }
  return pending;
}

export function addCollaborationCloudPanelOpenListener(
  target: Window,
  handler: () => void,
): () => void {
  const wrapped = () => {
    consumePendingCollaborationCloudPanelOpen(target);
    handler();
  };
  target.addEventListener(COLLABORATION_CLOUD_PANEL_OPEN_EVENT, wrapped);
  return () => target.removeEventListener(COLLABORATION_CLOUD_PANEL_OPEN_EVENT, wrapped);
}
