import { createContext, useContext, useEffect, useId, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';

export interface AppSidePaneRegistration {
  ownerId: string;
  title?: string;
  subtitle?: string;
  content: ReactNode;
}

export interface AppSidePaneHostValue {
  mountRegistration: (registration: AppSidePaneRegistration) => void;
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

  const value = useMemo<AppSidePaneHostValue>(() => ({
    mountRegistration: (registration) => {
      registrationRef.current = registration;
      listenersRef.current.forEach((listener) => listener());
    },
    unmountRegistration: (ownerId) => {
      if (registrationRef.current?.ownerId !== ownerId) return;
      registrationRef.current = null;
      listenersRef.current.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
    getSnapshot: () => registrationRef.current,
  }), []);

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

  useEffect(() => {
    if (!host || !enabled) return;

    host.mountRegistration({
      ownerId,
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
      content,
    });

    return () => {
      host.unmountRegistration(ownerId);
    };
  }, [content, enabled, host, ownerId, subtitle, title]);

  return host !== null && enabled;
}