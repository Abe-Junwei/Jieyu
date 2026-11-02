import { useEffect, useState, type ReactNode } from 'react';
import { t, type Locale } from '../i18n';
import { JieyuIcon } from './ui';

function readBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function AppOfflineStatusBanner({ locale }: { locale: Locale }): ReactNode {
  const [isOnline, setIsOnline] = useState<boolean>(readBrowserOnline);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(readBrowserOnline());
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    updateOnlineState();
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      className="app-offline-status"
      role="status"
      aria-live="polite"
      data-testid="app-offline-status"
    >
      <JieyuIcon name="WifiOff" aria-hidden className="app-offline-status-icon" />
      <span>{t(locale, 'app.offlineStatus.message')}</span>
    </div>
  );
}
