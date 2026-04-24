import type { ReactElement } from 'react';
import type { Locale } from '../i18n';
import { getAppDataResilienceMessages } from '../i18n/messages';

export type DbMigrationOverlayProps = {
  locale: Locale;
  fromVersion: number;
  toVersion: number;
};

/**
 * ARCH-5：数据库 schema 迁移期间的阻断遮罩。
 * Blocking overlay shown while IndexedDB schema migration is in progress (ARCH-5).
 */
export function DbMigrationOverlay(props: DbMigrationOverlayProps): ReactElement {
  const msg = getAppDataResilienceMessages(props.locale);

  return (
    <div
      className="db-migration-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="db-migration-overlay-title"
    >
      <div className="db-migration-overlay-panel">
        <h2 id="db-migration-overlay-title" className="db-migration-overlay-title">
          {msg.dbMigrationTitle}
        </h2>
        <p className="db-migration-overlay-intro">{msg.dbMigrationIntro}</p>
        <p className="db-migration-overlay-version">
          {msg.dbMigrationVersionHint}
          {': '}
          {props.fromVersion}
          {' -> '}
          {props.toVersion}
        </p>
        <p className="db-migration-overlay-wait">{msg.dbMigrationWait}</p>
      </div>
    </div>
  );
}
