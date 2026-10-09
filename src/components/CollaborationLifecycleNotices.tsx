/**
 * 协作生命周期提示（rev5 9.3）：其他标签页移除 / 云端删除了当前项目、服务器拒绝了本页的写入、
 * Service Worker 换成了新版本。只发全局提示，不挂任何界面。
 * Collaboration lifecycle notices (rev5 9.3): the open project was removed in another tab or deleted
 * in the cloud, the server rejected this tab's writes, or a new Service Worker took over.
 */
import { useEffect } from 'react';
import { subscribeCollaborationLifecycle } from '../collaboration/cloud/collaborationLifecycleBroadcast';
import { t, type Locale } from '../i18n';
import { dispatchAppGlobalToast } from '../utils/appGlobalToast';
import {
  clearActiveProjectTextId,
  getActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';

export function CollaborationLifecycleNotices({ locale }: { locale: Locale }): null {
  useEffect(() => {
    return subscribeCollaborationLifecycle((message) => {
      if (message.type === 'protocol-changed') {
        if (message.fromOtherTab === true) return;
        dispatchAppGlobalToast({
          message: t(locale, 'app.collabNotice.protocolRejected'),
          variant: 'error',
          autoDismissMs: 0,
        });
        return;
      }
      if (message.type === 'project-removed-locally' && message.fromOtherTab !== true) return;
      if (getActiveProjectTextId() !== message.projectId) return;
      clearActiveProjectTextId();
      dispatchAppGlobalToast({
        message: t(
          locale,
          message.type === 'project-deleted-cloud'
            ? 'app.collabNotice.projectDeletedInCloud'
            : 'app.collabNotice.projectRemovedInOtherTab',
        ),
        variant: 'info',
        autoDismissMs: 0,
      });
    });
  }, [locale]);

  // 发布新版本后提示刷新（9.3）：只有原来已经有 SW 控制页面时才提示，首次安装不提示。
  // Prompt to reload after a release (9.3); not on the very first install.
  useEffect(() => {
    if (typeof navigator === 'undefined' || navigator.serviceWorker === undefined) return;
    const container = navigator.serviceWorker;
    const hadController = container.controller !== null;
    if (!hadController) return;
    const onControllerChange = () => {
      dispatchAppGlobalToast({
        message: t(locale, 'app.collabNotice.appUpdated'),
        variant: 'info',
        autoDismissMs: 0,
      });
    };
    container.addEventListener('controllerchange', onControllerChange);
    return () => container.removeEventListener('controllerchange', onControllerChange);
  }, [locale]);

  return null;
}
