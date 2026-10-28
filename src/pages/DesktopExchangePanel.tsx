import { useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

type ExportKind = 'jyt' | 'jym' | 'manuscript';

function exportName(kind: ExportKind): string {
  switch (kind) {
    case 'jyt':
      return 'project.jyt';
    case 'jym':
      return 'project.jym';
    case 'manuscript':
      return 'manuscript.jyt';
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function DesktopExchangePanel(props: {
  sessionId: string;
  manuscriptId: string | null;
  desktopCall: DesktopReadHost['desktopCall'];
  chooseImportFile: NonNullable<DesktopReadHost['chooseImportFile']>;
  chooseExportFile: NonNullable<DesktopReadHost['chooseExportFile']>;
  onImported: () => Promise<unknown>;
}) {
  const locale = useLocale();
  const [failed, setFailed] = useState(false);
  const client = createDesktopClient({ desktopCall: props.desktopCall });

  const importFile = () => {
    setFailed(false);
    void props
      .chooseImportFile()
      .then(async (picked) => {
        if ('cancelled' in picked) return;
        const result = await client.importFile(props.sessionId, { file: picked.file });
        if (result.written === 0) {
          setFailed(true);
          return;
        }
        await props.onImported();
      })
      .catch(() => setFailed(true));
  };

  const exportPackage = (kind: ExportKind) => {
    if (kind === 'manuscript' && props.manuscriptId === null) return;
    setFailed(false);
    void props
      .chooseExportFile(exportName(kind))
      .then(async (picked) => {
        if ('cancelled' in picked) return;
        switch (kind) {
          case 'jyt':
            await client.exportJyt(props.sessionId, { file: picked.file });
            return;
          case 'jym':
            await client.exportJym(props.sessionId, { file: picked.file });
            return;
          case 'manuscript':
            if (props.manuscriptId === null) return;
            await client.exportManuscript(props.sessionId, {
              file: picked.file,
              manuscriptId: props.manuscriptId,
            });
            return;
          default: {
            const unreachable: never = kind;
            return unreachable;
          }
        }
      })
      .catch(() => setFailed(true));
  };

  return (
    <div className="desktop-project-read-units">
      <button type="button" onClick={importFile}>
        {t(locale, 'app.desktopRead.importFile')}
      </button>
      <button type="button" onClick={() => exportPackage('jyt')}>
        {t(locale, 'app.desktopRead.exportJyt')}
      </button>
      <button type="button" onClick={() => exportPackage('jym')}>
        {t(locale, 'app.desktopRead.exportJym')}
      </button>
      <button
        type="button"
        disabled={props.manuscriptId === null}
        onClick={() => exportPackage('manuscript')}
      >
        {t(locale, 'app.desktopRead.exportManuscript')}
      </button>
      {failed ? <p role="alert">{t(locale, 'app.desktopRead.loadFailed')}</p> : null}
    </div>
  );
}
