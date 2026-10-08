/**
 * D11：没有活动项目时，目录页面（词库、语言目录、正字法等）只显示空状态和“选择项目”入口，
 * 子页面不挂载，因此不会发生任何目录读写。
 * D11: without an active project, catalog pages show an empty state with a "Select project" entry;
 * the page itself is not mounted, so no catalog read or write happens.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { t, useLocale } from '../i18n';
import {
  getActiveProjectTextId,
  subscribeActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';
import { PanelButton } from './ui/PanelButton';
import '../styles/components/catalog-project-gate.css';

export function CatalogProjectGate(props: { children: ReactNode; onLeave?: () => void }) {
  const locale = useLocale();
  const navigate = useNavigate();
  const projectTextId = useSyncExternalStore(
    subscribeActiveProjectTextId,
    getActiveProjectTextId,
    () => '',
  );
  if (projectTextId.trim().length > 0) return <>{props.children}</>;
  return (
    <section
      className="catalog-project-gate"
      data-testid="catalog-project-gate"
      aria-labelledby="catalog-project-gate-title"
    >
      <h2 id="catalog-project-gate-title" className="catalog-project-gate__title">
        {t(locale, 'catalog.projectGate.title')}
      </h2>
      <p className="catalog-project-gate__description">
        {t(locale, 'catalog.projectGate.description')}
      </p>
      <PanelButton
        variant="primary"
        data-testid="catalog-project-gate-select"
        onClick={() => {
          props.onLeave?.();
          void navigate('/');
        }}
      >
        {t(locale, 'catalog.projectGate.selectProject')}
      </PanelButton>
    </section>
  );
}
