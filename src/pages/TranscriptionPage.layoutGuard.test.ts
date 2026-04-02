import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Transcription layout guard', () => {
  it('keeps shell body layout styles for transcription route', () => {
    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    const appCode = fs.readFileSync(appPath, 'utf8');

    expect(appCode).toContain("const isTranscriptionRoute = location.pathname.startsWith('/transcription');");
    expect(appCode).toContain("app-shell-transcription");
    expect(appCode).toContain("app-shell-body");
    expect(appCode).toContain("app-main-transcription");
    expect(appCode).toContain('id="app-side-pane-body-slot"');
    expect(appCode).toContain('app-side-pane-handle-cluster');
    expect(appCode).not.toContain('className="app-side-pane-hover-zone"');
    expect(appCode).toContain("isSidePaneCollapsed ? '0px' : `${sidePaneWidth}px`");
  });

  it('keeps stylesheet shell-body selector for rail-reserved transcription main area', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/global.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const bodySelector = '.app-shell-body {';
    const bodyStart = cssCode.indexOf(bodySelector);

    expect(bodyStart).toBeGreaterThanOrEqual(0);

    const bodyEnd = cssCode.indexOf('}', bodyStart);
    expect(bodyEnd).toBeGreaterThan(bodyStart);

    const bodyBlock = cssCode.slice(bodyStart, bodyEnd + 1);
    expect(bodyBlock).toContain('display: grid;');
    expect(bodyBlock).toContain('grid-template-columns: var(--left-rail-width) minmax(0, 1fr);');

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

  it('keeps speaker management popover centered in the viewport', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/transcription.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const selector = '.transcription-side-pane-action-popover-centered {';
    const start = cssCode.indexOf(selector);

    expect(start).toBeGreaterThanOrEqual(0);

    const end = cssCode.indexOf('}', start);
    expect(end).toBeGreaterThan(start);

    const block = cssCode.slice(start, end + 1);
    expect(block).toContain('position: fixed;');
    expect(block).toContain('left: 50%;');
    expect(block).toContain('top: 50%;');
    expect(block).toContain('transform: translate(-50%, -50%);');
  });

  it('keeps lane-label resize handle interactive styles', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/transcription.css');
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
  });

  it('keeps subtrack wrappers non-interactive while annotation items stay interactive', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/transcription.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const subtrackSelector = '.timeline-annotation-subtrack {';
    const subtrackStart = cssCode.indexOf(subtrackSelector);
    expect(subtrackStart).toBeGreaterThanOrEqual(0);
    const subtrackEnd = cssCode.indexOf('}', subtrackStart);
    expect(subtrackEnd).toBeGreaterThan(subtrackStart);
    const subtrackBlock = cssCode.slice(subtrackStart, subtrackEnd + 1);
    expect(subtrackBlock).toContain('pointer-events: none;');

    const annotationSelector = '.timeline-annotation {';
    const annotationStart = cssCode.indexOf(annotationSelector);
    expect(annotationStart).toBeGreaterThanOrEqual(0);
    const annotationEnd = cssCode.indexOf('}', annotationStart);
    expect(annotationEnd).toBeGreaterThan(annotationStart);
    const annotationBlock = cssCode.slice(annotationStart, annotationEnd + 1);
    expect(annotationBlock).toContain('pointer-events: auto;');
  });
});
