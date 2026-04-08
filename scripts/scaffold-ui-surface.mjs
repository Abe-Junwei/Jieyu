import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COMPONENTS_DIR = path.join(ROOT, 'src', 'components');
const PANEL_STYLES_DIR = path.join(ROOT, 'src', 'styles', 'panels');

const argMap = new Map(
  process.argv.slice(2)
    .map((arg) => arg.trim())
    .filter(Boolean)
    .map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, '').split('=');
      return [key, rest.join('=')];
    }),
);

const type = argMap.get('type') ?? 'panel';
const name = argMap.get('name');

function toKebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function ensurePascalName(raw) {
  if (!raw) return '';
  const normalized = raw.replace(/[^a-zA-Z0-9]/g, ' ').trim();
  if (!normalized) return '';
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function writeFileOrThrow(filePath, content) {
  if (fs.existsSync(filePath)) {
    throw new Error(`file already exists: ${path.relative(ROOT, filePath)}`);
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function buildPanelTemplate(componentName, classRoot, cssRelPath) {
  return `import '${cssRelPath}';

type ${componentName}Props = {
  title?: string;
};

export function ${componentName}({ title = '${componentName}' }: ${componentName}Props) {
  return (
    <section className="${classRoot}" aria-label={title}>
      <header className="${classRoot}__header">
        <h3 className="${classRoot}__title">{title}</h3>
      </header>
      <div className="${classRoot}__body">
        <p className="${classRoot}__hint">TODO: implement panel content.</p>
      </div>
      <footer className="${classRoot}__footer">
        <button type="button" className="btn btn-ghost">Cancel</button>
        <button type="button" className="btn">Confirm</button>
      </footer>
    </section>
  );
}
`;
}

function buildDialogTemplate(componentName, classRoot, cssRelPath) {
  return `import '${cssRelPath}';

type ${componentName}Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
};

export function ${componentName}({ open, title = '${componentName}', onClose }: ${componentName}Props) {
  if (!open) return null;

  return (
    <div className="dialog-overlay" role="presentation" onClick={onClose}>
      <section className={
        \`dialog-card ${classRoot}\`
      } role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <h3 className="dialog-shell__title">{title}</h3>
        </header>
        <div className={\`dialog-body ${classRoot}__body\`}>
          <p className="small-text">TODO: implement dialog content.</p>
        </div>
        <footer className="dialog-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn">Confirm</button>
        </footer>
      </section>
    </div>
  );
}
`;
}

function buildPanelCss(classRoot) {
  return `.${classRoot} {
  display: grid;
  gap: 10px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-soft);
  background: var(--surface-panel);
  padding: 12px;
}

.${classRoot}__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.${classRoot}__title {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-primary);
}

.${classRoot}__body {
  display: grid;
  gap: 8px;
}

.${classRoot}__hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.${classRoot}__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
`;
}

function main() {
  const pascalName = ensurePascalName(name ?? '');
  if (!pascalName) {
    console.error('[scaffold-ui-surface] usage: npm run scaffold:ui-surface -- --type=panel|dialog --name=MySurface');
    process.exit(1);
  }

  const mode = type === 'dialog' ? 'dialog' : 'panel';
  const suffix = mode === 'dialog' ? 'Dialog' : 'Panel';
  const componentName = pascalName.endsWith(suffix) ? pascalName : `${pascalName}${suffix}`;
  const kebabBase = toKebabCase(componentName.replace(/(Panel|Dialog)$/, ''));
  const classRoot = mode === 'dialog' ? `pnl-${kebabBase}-dialog` : `pnl-${kebabBase}-panel`;

  const componentFile = path.join(COMPONENTS_DIR, `${componentName}.tsx`);
  const styleFile = path.join(PANEL_STYLES_DIR, `${kebabBase}-${mode}.css`);
  const cssImportPath = `../styles/panels/${kebabBase}-${mode}.css`;

  const componentCode = mode === 'dialog'
    ? buildDialogTemplate(componentName, classRoot, cssImportPath)
    : buildPanelTemplate(componentName, classRoot, cssImportPath);

  writeFileOrThrow(componentFile, componentCode);
  writeFileOrThrow(styleFile, buildPanelCss(classRoot));

  console.log(`[scaffold-ui-surface] created component: ${path.relative(ROOT, componentFile)}`);
  console.log(`[scaffold-ui-surface] created style: ${path.relative(ROOT, styleFile)}`);
  console.log('[scaffold-ui-surface] remember to import the new css file from src/styles/transcription-entry.css when needed.');
}

main();
