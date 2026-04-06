import { createContext, useContext, useEffect, useId, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';

export interface AppSidePaneRegistration {
  ownerId: string;
  title?: string;
  subtitle?: string;
  content: ReactNode;
}

export interface AppSidePaneHostValue {
  mountRegistration: (registration: AppSidePaneRegistration) => void;
  updateRegistrationContent: (ownerId: string, patch: { title?: string; subtitle?: string; content: ReactNode }) => void;
  unmountRegistration: (ownerId: string) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppSidePaneRegistration | null;
}

const AppSidePaneContext = createContext<AppSidePaneHostValue | null>(null);

export function AppSidePaneProvider({
  children,
}: {
  children: ReactNode;
}) {
  const registrationRef = useRef<AppSidePaneRegistration | null>(null);
  const listenersRef = useRef(new Set<() => void>());
  const pendingNotifyRef = useRef(false);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (notifyTimerRef.current !== null) {
      clearTimeout(notifyTimerRef.current);
      notifyTimerRef.current = null;
    }
    pendingNotifyRef.current = false;
  }, []);

  const value = useMemo<AppSidePaneHostValue>(() => {
    const scheduleNotify = () => {
      if (pendingNotifyRef.current) return;
      pendingNotifyRef.current = true;
      notifyTimerRef.current = setTimeout(() => {
        pendingNotifyRef.current = false;
        notifyTimerRef.current = null;
        listenersRef.current.forEach((listener) => listener());
      }, 0);
    };

    return {
      mountRegistration: (registration) => {
        registrationRef.current = registration;
        // 同步通知 — 保证首次挂载后订阅者立即可见 | Sync notify — subscriber sees content immediately after first mount
        listenersRef.current.forEach((listener) => listener());
      },
      updateRegistrationContent: (ownerId, patch) => {
        if (registrationRef.current?.ownerId !== ownerId) return;
        const currentRegistration = registrationRef.current;
        if (
          currentRegistration.title === patch.title
          && currentRegistration.subtitle === patch.subtitle
          && currentRegistration.content === patch.content
        ) {
          return;
        }
        // 创建新快照让 useSyncExternalStore 检测变化 | New snapshot for useSyncExternalStore change detection
        registrationRef.current = { ...currentRegistration, ...patch };
        // 延迟通知 — 切到下一轮任务，避免 commit 链内嵌套更新 | Defer to next task to avoid nested updates in the current commit chain
        scheduleNotify();
      },
      unmountRegistration: (ownerId) => {
        if (registrationRef.current?.ownerId !== ownerId) return;
        registrationRef.current = null;
        // 同步通知 — 卸载后订阅者立即清空 | Sync notify — subscriber clears immediately after unmount
        listenersRef.current.forEach((listener) => listener());
      },
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      getSnapshot: () => registrationRef.current,
    };
  }, []);

  return (
    <AppSidePaneContext.Provider value={value}>
      {children}
    </AppSidePaneContext.Provider>
  );
}

export function useAppSidePaneHostOptional() {
  return useContext(AppSidePaneContext);
}

export function useAppSidePaneRegistrationSnapshot() {
  const host = useAppSidePaneHostOptional();

  return useSyncExternalStore(
    host?.subscribe ?? (() => () => {}),
    host?.getSnapshot ?? (() => null),
    () => null,
  );
}

export function useRegisterAppSidePane({
  title,
  subtitle,
  content,
  enabled = true,
}: {
  title?: string;
  subtitle?: string;
  content: ReactNode;
  enabled?: boolean;
}) {
  const host = useAppSidePaneHostOptional();
  const ownerId = useId();

  // 用 ref 存最新值，避免 content 进入生命周期 effect 依赖导致每帧 unmount/mount 循环
  // Refs to avoid content/title/subtitle in lifecycle deps — prevents unmount/mount churn
  const contentRef = useRef(content);
  const titleRef = useRef(title);
  const subtitleRef = useRef(subtitle);
  contentRef.current = content;
  titleRef.current = title;
  subtitleRef.current = subtitle;

  // 挂载/卸载生命周期 — 仅在 enabled/host 变化时同步通知
  // Mount/unmount lifecycle — sync notification only on enabled/host change
  useEffect(() => {
    if (!host || !enabled) return;

    host.mountRegistration({
      ownerId,
      ...(titleRef.current ? { title: titleRef.current } : {}),
      ...(subtitleRef.current ? { subtitle: subtitleRef.current } : {}),
      content: contentRef.current,
    });

    return () => {
      host.unmountRegistration(ownerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content/title/subtitle 由 updateRegistrationContent 处理
  }, [enabled, host, ownerId]);

  // 内容更新 — 每次渲染推送最新 content/title/subtitle（延迟通知，不阻塞 commit）
  // Content update — pushes latest values on each render with deferred notification
  useEffect(() => {
    if (!host || !enabled) return;
    host.updateRegistrationContent(ownerId, {
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
      content,
    });
  }, [content, enabled, host, ownerId, subtitle, title]);

  return host !== null && enabled;
}