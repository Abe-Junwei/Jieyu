/**
 * §3.3-6 / R2：本会话不再对某 provider+model 附带原生 tools（M2 拒收与设置页紧急降级共用）。
 * In-memory only — cleared on full page reload.
 */
const noToolsThisSession = new Set<string>();

export const markNoToolsThisSession = (providerId: string, model: string) =>
  noToolsThisSession.add(`${providerId}:${model}`);
export const isNoToolsThisSession = (providerId: string, model: string) =>
  noToolsThisSession.has(`${providerId}:${model}`);
export const clearNoToolsThisSession = (providerId: string, model: string) =>
  noToolsThisSession.delete(`${providerId}:${model}`);
export const resetNoToolsThisSessionForTests = () => noToolsThisSession.clear();
