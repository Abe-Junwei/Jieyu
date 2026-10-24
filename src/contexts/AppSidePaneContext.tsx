import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export interface AppSidePaneRegistration {
  ownerId: string;
  title?: string;
  subtitle?: string;
  content: ReactNode;
}

/** Store snapshot for `useSyncExternalStore` — must stay referentially stable until revision bumps. */
type AppSidePaneStoreSnapshot = {
  ownerId: string;
  title?: string;
  subtitle?: string;
  revision: number;
};

export interface AppSidePaneHostValue {
  mountRegistration: (registration: AppSidePaneRegistration) => void;
  updateRegistrationContent: (
    ownerId: string,
    patch: { title?: string; subtitle?: string; content: ReactNode },
  ) => void;
  unmountRegistration: (ownerId: string) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppSidePaneStoreSnapshot | null;
  getContent: (ownerId: string) => ReactNode;
}

const AppSidePaneContext = createContext<AppSidePaneHostValue | null>(null);

function LiveSidePaneContent({
  store,
}: {
  store: { subscribe: (listener: () => void) => () => void; getSnapshot: () => ReactNode };
}) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Stable fallbacks for `useSyncExternalStore` when no host (identity must not change per render). */
function emptySidePaneSubscribe(_listener: () => void): () => void {
  return () => {};
}

function nullSidePaneSnapshot(): AppSidePaneStoreSnapshot | null {
  return null;
}

export function AppSidePaneProvider({ children }: { children: ReactNode }) {
  const metaRef = useRef<AppSidePaneStoreSnapshot | null>(null);
  const contentByOwnerRef = useRef(new Map<string, ReactNode>());
  const listenersRef = useRef(new Set<() => void>());
  const pendingNotifyRef = useRef(false);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (notifyTimerRef.current !== null) {
        clearTimeout(notifyTimerRef.current);
        notifyTimerRef.current = null;
      }
      pendingNotifyRef.current = false;
    },
    [],
  );

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

    const publishMeta = (
      ownerId: string,
      title: string | undefined,
      subtitle: string | undefined,
      options?: { syncNotify?: boolean },
    ) => {
      const prev = metaRef.current;
      const sameOwner = prev?.ownerId === ownerId;
      const sameTitle = sameOwner && prev?.title === title;
      const sameSubtitle = sameOwner && prev?.subtitle === subtitle;
      if (sameOwner && sameTitle && sameSubtitle) {
        return false;
      }
      metaRef.current = {
        ownerId,
        ...(title !== undefined && title.length > 0 ? { title } : {}),
        ...(subtitle !== undefined ? { subtitle } : {}),
        revision: (prev?.revision ?? 0) + 1,
      };
      if (options?.syncNotify === true) {
        listenersRef.current.forEach((listener) => listener());
      } else {
        scheduleNotify();
      }
      return true;
    };

    return {
      mountRegistration: (registration) => {
        contentByOwnerRef.current.set(registration.ownerId, registration.content);
        publishMeta(registration.ownerId, registration.title, registration.subtitle, {
          syncNotify: true,
        });
      },
      updateRegistrationContent: (ownerId, patch) => {
        const prevMeta = metaRef.current;
        if (prevMeta?.ownerId !== ownerId) return;

        // Content has its own subscription; identity churn must not rerender the shell.
        contentByOwnerRef.current.set(ownerId, patch.content);

        // Callers omit empty title/subtitle keys; keep previous meta when a key is absent.
        const nextTitle = 'title' in patch ? patch.title : prevMeta.title;
        const nextSubtitle = 'subtitle' in patch ? patch.subtitle : prevMeta.subtitle;
        publishMeta(ownerId, nextTitle, nextSubtitle);
      },
      unmountRegistration: (ownerId) => {
        if (metaRef.current?.ownerId !== ownerId) return;
        contentByOwnerRef.current.delete(ownerId);
        metaRef.current = null;
        listenersRef.current.forEach((listener) => listener());
      },
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      getSnapshot: () => metaRef.current,
      getContent: (ownerId) => contentByOwnerRef.current.get(ownerId) ?? null,
    };
  }, []);

  return <AppSidePaneContext.Provider value={value}>{children}</AppSidePaneContext.Provider>;
}

export function useAppSidePaneHostOptional() {
  return useContext(AppSidePaneContext);
}

export function useAppSidePaneRegistrationSnapshot(): AppSidePaneRegistration | null {
  const host = useAppSidePaneHostOptional();

  const meta = useSyncExternalStore(
    host?.subscribe ?? emptySidePaneSubscribe,
    host?.getSnapshot ?? nullSidePaneSnapshot,
    nullSidePaneSnapshot,
  );

  return useMemo(() => {
    if (!host || !meta) return null;
    return {
      ownerId: meta.ownerId,
      ...(meta.title !== undefined ? { title: meta.title } : {}),
      ...(meta.subtitle !== undefined ? { subtitle: meta.subtitle } : {}),
      content: host.getContent(meta.ownerId),
    };
  }, [host, meta]);
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

  const [contentStore] = useState(() => {
    let snapshot = content;
    const listeners = new Set<() => void>();
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      update: (next: ReactNode) => {
        if (Object.is(snapshot, next)) return;
        snapshot = next;
        listeners.forEach((listener) => listener());
      },
    };
  });
  const registeredContent = useMemo(
    () => <LiveSidePaneContent store={contentStore} />,
    [contentStore],
  );
  const titleRef = useRef(title);
  const subtitleRef = useRef(subtitle);
  titleRef.current = title;
  subtitleRef.current = subtitle;

  useEffect(() => {
    contentStore.update(content);
  }, [content, contentStore]);

  // Mount / unmount lifecycle — sync notify so the shell sees the first paint immediately.
  useEffect(() => {
    if (!host || !enabled) return;

    host.mountRegistration({
      ownerId,
      ...(titleRef.current !== undefined && titleRef.current.length > 0
        ? { title: titleRef.current }
        : {}),
      ...(subtitleRef.current !== undefined ? { subtitle: subtitleRef.current } : {}),
      content: registeredContent,
    });

    return () => {
      host.unmountRegistration(ownerId);
    };
  }, [enabled, host, ownerId, registeredContent]);

  // Push title/subtitle/content; store notifies only when title/subtitle change.
  useEffect(() => {
    if (!host || !enabled) return;
    host.updateRegistrationContent(ownerId, {
      ...(title !== undefined && title.length > 0 ? { title } : {}),
      ...(subtitle !== undefined ? { subtitle } : {}),
      content: registeredContent,
    });
  }, [enabled, host, ownerId, registeredContent, subtitle, title]);

  return host !== null && enabled;
}
