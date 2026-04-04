import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Transcription layout guard', () => {
  it('keeps shell body layout styles for transcription route', () => {
    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    const appCode = fs.readFileSync(appPath, 'utf8');
    const foundationPath = path.resolve(process.cwd(), 'src/styles/app-foundation.css');
    const foundationCode = fs.readFileSync(foundationPath, 'utf8');

    expect(appCode).toContain("const isTranscriptionRoute = location.pathname.startsWith('/transcription');");
    expect(appCode).toContain("app-shell-transcription");
    expect(appCode).toContain("app-shell-body");
    expect(appCode).toContain("app-main-transcription");
    expect(appCode).toContain('id="app-side-pane-body-slot"');
    expect(appCode).toContain('app-side-pane-handle-cluster');
    expect(appCode).not.toContain('className="app-side-pane-hover-zone"');
    expect(appCode).toContain("isSidePaneCollapsed ? '0px' : `${sidePaneWidth}px`");
    expect(foundationCode).toContain("@import './pages/app-shell-layout.css';");
  });

  it('keeps stylesheet shell-body selector for rail-reserved transcription main area', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/pages/app-shell-layout.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const bodySelector = '.app-shell-body {';
    const bodyStart = cssCode.indexOf(bodySelector);

    expect(bodyStart).toBeGreaterThanOrEqual(0);

    const bodyEnd = cssCode.indexOf('}', bodyStart);
    expect(bodyEnd).toBeGreaterThan(bodyStart);

    const bodyBlock = cssCode.slice(bodyStart, bodyEnd + 1);
    expect(bodyBlock).toContain('display: grid;');
    expect(bodyBlock).toContain('grid-template-columns: var(--left-rail-width) minmax(0, 1fr);');

    const mainSelector = '.app-main {';
    const mainStart = cssCode.indexOf(mainSelector);
    expect(mainStart).toBeGreaterThanOrEqual(0);
    const mainEnd = cssCode.indexOf('}', mainStart);
    expect(mainEnd).toBeGreaterThan(mainStart);
    const mainBlock = cssCode.slice(mainStart, mainEnd + 1);
    expect(mainBlock).toContain('overflow: auto;');

    const paneSelector = '.app-side-pane {';
    const paneStart = cssCode.indexOf(paneSelector);
    expect(paneStart).toBeGreaterThanOrEqual(0);
    const paneEnd = cssCode.indexOf('}', paneStart);
    expect(paneEnd).toBeGreaterThan(paneStart);
    const paneBlock = cssCode.slice(paneStart, paneEnd + 1);
    expect(paneBlock).toContain('position: absolute;');
    expect(paneBlock).toContain('width: var(--side-pane-width);');

    const responsiveStart = cssCode.indexOf('@media (max-width: 1024px) {');
    expect(responsiveStart).toBeGreaterThanOrEqual(0);
    const responsiveSlice = cssCode.slice(responsiveStart);
    expect(responsiveSlice).toContain('.app-side-pane {');
    expect(responsiveSlice).toContain('display: none;');
  });

  it('keeps transcription route host container styles in dedicated page layout css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/pages/transcription-layout.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const selector = '.app-shell-transcription .app-main-transcription {';
    const start = cssCode.indexOf(selector);

    expect(start).toBeGreaterThanOrEqual(0);

    const end = cssCode.indexOf('}', start);
    expect(end).toBeGreaterThan(start);

    const block = cssCode.slice(start, end + 1);
    expect(block).toContain('position: relative;');
    expect(block).toContain('height: 100%;');
    expect(block).toContain('min-height: 0;');
  });

  it('keeps SidePaneActionModal dialog-card width policy clamped to viewport', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/panels/action-dialogs.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const standardSelector = '.side-pane-action-modal.dialog-card';
    const standardStart = cssCode.indexOf(standardSelector);

    expect(standardStart).toBeGreaterThanOrEqual(0);

    const standardEnd = cssCode.indexOf('}', standardStart);
    expect(standardEnd).toBeGreaterThan(standardStart);

    const standardBlock = cssCode.slice(standardStart, standardEnd + 1);
    expect(standardBlock).toContain('width: min(var(--dialog-auto-width');
    expect(standardBlock).toContain('92vw');
    expect(standardBlock).toContain('max-height');

    const speakerSelector = '.side-pane-action-modal-speaker.dialog-card';
    const speakerStart = cssCode.indexOf(speakerSelector);

    expect(speakerStart).toBeGreaterThanOrEqual(0);

    const speakerEnd = cssCode.indexOf('}', speakerStart);
    expect(speakerEnd).toBeGreaterThan(speakerStart);

    const speakerBlock = cssCode.slice(speakerStart, speakerEnd + 1);
    expect(speakerBlock).toContain('width: min(var(--dialog-auto-width');
    expect(speakerBlock).toContain('92vw');
    expect(speakerBlock).toContain('max-height');
  });

  it('keeps transcription workspace container styles in dedicated page layout css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/pages/transcription-layout.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const workspaceSelector = '.transcription-workspace {\n  min-height: 420px;';
    const workspaceStart = cssCode.indexOf(workspaceSelector);
    expect(workspaceStart).toBeGreaterThanOrEqual(0);
    const workspaceEnd = cssCode.indexOf('}', workspaceStart);
    expect(workspaceEnd).toBeGreaterThan(workspaceStart);
    const workspaceBlock = cssCode.slice(workspaceStart, workspaceEnd + 1);
    expect(workspaceBlock).toContain('display: flex;');
    expect(workspaceBlock).toContain('flex-direction: row;');
    expect(workspaceBlock).toContain('--transcription-ai-visible-width');

    const panelSelector = '.transcription-list-panel {';
    const panelStart = cssCode.indexOf(panelSelector);
    expect(panelStart).toBeGreaterThanOrEqual(0);
    const panelEnd = cssCode.indexOf('}', panelStart);
    expect(panelEnd).toBeGreaterThan(panelStart);
    const panelBlock = cssCode.slice(panelStart, panelEnd + 1);
    expect(panelBlock).toContain('margin-right: var(--transcription-ai-visible-width);');
  });

  it('keeps transcription toolbar layout styles in dedicated page toolbar css', () => {
    const entryPath = path.resolve(process.cwd(), 'src/styles/transcription-entry.css');
    const entryCode = fs.readFileSync(entryPath, 'utf8');
    expect(entryCode).toContain("@import './pages/transcription-toolbar.css';");

    const cssPath = path.resolve(process.cwd(), 'src/styles/pages/transcription-toolbar.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const toolbarSelector = '.transcription-wave-toolbar {';
    const toolbarStart = cssCode.indexOf(toolbarSelector);
    expect(toolbarStart).toBeGreaterThanOrEqual(0);
    const toolbarEnd = cssCode.indexOf('}', toolbarStart);
    expect(toolbarEnd).toBeGreaterThan(toolbarStart);
    const toolbarBlock = cssCode.slice(toolbarStart, toolbarEnd + 1);
    expect(toolbarBlock).toContain('display: flex;');
    expect(toolbarBlock).toContain('justify-content: space-between;');

    const floatingSelector = '.app-shell-transcription .transcription-wave-toolbar-right:not(.transcription-wave-toolbar-right-portaled) {';
    const floatingStart = cssCode.indexOf(floatingSelector);
    expect(floatingStart).toBeGreaterThanOrEqual(0);
    const floatingEnd = cssCode.indexOf('}', floatingStart);
    expect(floatingEnd).toBeGreaterThan(floatingStart);
    const floatingBlock = cssCode.slice(floatingStart, floatingEnd + 1);
    expect(floatingBlock).toContain('position: fixed;');
    expect(floatingBlock).toContain('width: clamp(240px, calc(var(--side-pane-width) + var(--side-pane-gap)), 340px);');

    const portaledSelector = '.app-left-rail-bottom-slot .transcription-wave-toolbar-right-portaled {';
    const portaledStart = cssCode.indexOf(portaledSelector);
    expect(portaledStart).toBeGreaterThanOrEqual(0);
    const portaledEnd = cssCode.indexOf('}', portaledStart);
    expect(portaledEnd).toBeGreaterThan(portaledStart);
    const portaledBlock = cssCode.slice(portaledStart, portaledEnd + 1);
    expect(portaledBlock).toContain('display: grid;');
    expect(portaledBlock).toContain('overflow-y: auto;');

    const legacyCssPath = path.resolve(process.cwd(), 'src/styles/transcription.css');
    const legacyCssCode = fs.readFileSync(legacyCssPath, 'utf8');
    expect(legacyCssCode).not.toContain(portaledSelector);
  });

  it('keeps observer status styles in dedicated page toolbar css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/pages/transcription-toolbar.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const observerSelector = '.transcription-ai-observer-status {';
    const observerStart = cssCode.indexOf(observerSelector);
    expect(observerStart).toBeGreaterThanOrEqual(0);
    const observerEnd = cssCode.indexOf('}', observerStart);
    expect(observerEnd).toBeGreaterThan(observerStart);
    const observerBlock = cssCode.slice(observerStart, observerEnd + 1);
    expect(observerBlock).toContain('display: flex;');
    expect(observerBlock).toContain('border-top:');

    const barSelector = '.transcription-ai-observer-status-bar {';
    expect(cssCode.indexOf(barSelector)).toBeGreaterThanOrEqual(0);

    const legacyCssPath = path.resolve(process.cwd(), 'src/styles/transcription.css');
    const legacyCssCode = fs.readFileSync(legacyCssPath, 'utf8');
    expect(legacyCssCode).not.toContain(observerSelector);
  });

  it('keeps timeline base styles in dedicated page timeline css', () => {
    const entryPath = path.resolve(process.cwd(), 'src/styles/transcription-entry.css');
    const entryCode = fs.readFileSync(entryPath, 'utf8');
    expect(entryCode).toContain("@import './pages/transcription-timeline.css';");

    const cssPath = path.resolve(process.cwd(), 'src/styles/pages/transcription-timeline.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const scrollSelector = '.timeline-scroll {';
    const scrollStart = cssCode.indexOf(scrollSelector);
    expect(scrollStart).toBeGreaterThanOrEqual(0);
    const scrollEnd = cssCode.indexOf('}', scrollStart);
    expect(scrollEnd).toBeGreaterThan(scrollStart);
    const scrollBlock = cssCode.slice(scrollStart, scrollEnd + 1);
    expect(scrollBlock).toContain('overflow-x: auto;');
    expect(scrollBlock).toContain('overflow-y: auto;');

    const laneSelector = '.timeline-lane {';
    const laneStart = cssCode.indexOf(laneSelector);
    expect(laneStart).toBeGreaterThanOrEqual(0);

    const legacyCssPath = path.resolve(process.cwd(), 'src/styles/transcription.css');
    const legacyCssCode = fs.readFileSync(legacyCssPath, 'utf8');
    expect(legacyCssCode).not.toContain(scrollSelector);
    expect(legacyCssCode).not.toContain(laneSelector);
  });

  it('keeps lane-link and waveform-overview infra styles in timeline css', () => {
    const timelineCssPath = path.resolve(process.cwd(), 'src/styles/pages/transcription-timeline.css');
    const timelineCssCode = fs.readFileSync(timelineCssPath, 'utf8');

    const laneLinkSelector = '.lane-link-stack {';
    expect(timelineCssCode.indexOf(laneLinkSelector)).toBeGreaterThanOrEqual(0);

    const overviewSelector = '.waveform-overview-bar {';
    expect(timelineCssCode.indexOf(overviewSelector)).toBeGreaterThanOrEqual(0);

    const sharedCssPath = path.resolve(process.cwd(), 'src/styles/shared.css');
    const sharedCssCode = fs.readFileSync(sharedCssPath, 'utf8');
    expect(sharedCssCode).not.toContain(laneLinkSelector);
    expect(sharedCssCode).not.toContain(overviewSelector);
  });

  it('keeps timeline lane label and focused styles in timeline css', () => {
    const timelineCssPath = path.resolve(process.cwd(), 'src/styles/pages/transcription-timeline.css');
    const timelineCssCode = fs.readFileSync(timelineCssPath, 'utf8');

    const laneLabelRegex = /^\.timeline-lane-label\s*\{/m;
    expect(laneLabelRegex.test(timelineCssCode)).toBe(true);

    const laneFocusedRegex = /^\.timeline-lane-focused\s*\{/m;
    expect(laneFocusedRegex.test(timelineCssCode)).toBe(true);

    const legacyCssPath = path.resolve(process.cwd(), 'src/styles/transcription.css');
    const legacyCssCode = fs.readFileSync(legacyCssPath, 'utf8');
    expect(laneLabelRegex.test(legacyCssCode)).toBe(false);
    expect(laneFocusedRegex.test(legacyCssCode)).toBe(false);
  });

  it('keeps AI sidebar shell styles in dedicated sidebar shell css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/pages/ai-sidebar-shell.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const sidebarSelector = '.transcription-hub-sidebar {';
    const sidebarStart = cssCode.indexOf(sidebarSelector);
    expect(sidebarStart).toBeGreaterThanOrEqual(0);
    const sidebarEnd = cssCode.indexOf('}', sidebarStart);
    expect(sidebarEnd).toBeGreaterThan(sidebarStart);
    const sidebarBlock = cssCode.slice(sidebarStart, sidebarEnd + 1);
    expect(sidebarBlock).toContain('position: absolute;');
    expect(sidebarBlock).toContain('width: var(--hub-sidebar-width, 380px);');

    const panelSelector = '.transcription-ai-panel {';
    const panelStart = cssCode.indexOf(panelSelector);
    expect(panelStart).toBeGreaterThanOrEqual(0);
    const panelEnd = cssCode.indexOf('}', panelStart);
    expect(panelEnd).toBeGreaterThan(panelStart);
    const panelBlock = cssCode.slice(panelStart, panelEnd + 1);
    expect(panelBlock).toContain('position: absolute;');
    expect(panelBlock).toContain('width: var(--transcription-ai-visible-width);');
  });

  it('keeps lane-label resize handle interactive styles in timeline css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/pages/transcription-timeline.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const selector = '.lane-label-resize-handle {';
    const start = cssCode.indexOf(selector);

    expect(start).toBeGreaterThanOrEqual(0);

    const end = cssCode.indexOf('}', start);
    expect(end).toBeGreaterThan(start);

    const block = cssCode.slice(start, end + 1);
    expect(block).toContain('position: absolute;');
    expect(block).toContain('right: 0;');
    expect(block).toContain('width: 10px;');
    expect(block).toContain('cursor: ew-resize;');
    expect(block).toContain('pointer-events: auto;');

    const legacyCssPath = path.resolve(process.cwd(), 'src/styles/transcription.css');
    const legacyCssCode = fs.readFileSync(legacyCssPath, 'utf8');
    expect(legacyCssCode).not.toContain(selector);
  });

  it('keeps subtrack wrappers in timeline css while annotation items stay interactive', () => {
    const timelineCssPath = path.resolve(process.cwd(), 'src/styles/pages/transcription-timeline.css');
    const timelineCssCode = fs.readFileSync(timelineCssPath, 'utf8');

    const subtrackSelector = '.timeline-annotation-subtrack {';
    const subtrackStart = timelineCssCode.indexOf(subtrackSelector);
    expect(subtrackStart).toBeGreaterThanOrEqual(0);
    const subtrackEnd = timelineCssCode.indexOf('}', subtrackStart);
    expect(subtrackEnd).toBeGreaterThan(subtrackStart);
    const subtrackBlock = timelineCssCode.slice(subtrackStart, subtrackEnd + 1);
    expect(subtrackBlock).toContain('pointer-events: none;');

    const legacyCssPath = path.resolve(process.cwd(), 'src/styles/transcription.css');
    const legacyCssCode = fs.readFileSync(legacyCssPath, 'utf8');
    expect(legacyCssCode).not.toContain(subtrackSelector);

    const annotationSelector = '.timeline-annotation {';
    const annotationStart = timelineCssCode.indexOf(annotationSelector);
    expect(annotationStart).toBeGreaterThanOrEqual(0);
    const annotationEnd = timelineCssCode.indexOf('}', annotationStart);
    expect(annotationEnd).toBeGreaterThan(annotationStart);
    const annotationBlock = timelineCssCode.slice(annotationStart, annotationEnd + 1);
    expect(annotationBlock).toContain('pointer-events: auto;');

    expect(legacyCssCode).not.toContain(annotationSelector);
  });
});
