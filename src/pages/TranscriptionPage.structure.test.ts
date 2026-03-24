import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type JsxWithClass = {
  node: ts.JsxElement | ts.JsxSelfClosingElement;
  start: number;
  end: number;
};

function getClassNameText(attr: ts.JsxAttribute, sourceFile: ts.SourceFile): string {
  if (!attr.initializer) return '';
  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text;
  }
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    return attr.initializer.expression.getText(sourceFile);
  }
  return attr.initializer.getText(sourceFile);
}

function findFirstJsxByClassName(sourceFile: ts.SourceFile, classNeedle: string): JsxWithClass | null {
  let found: JsxWithClass | null = null;

  const visit = (node: ts.Node) => {
    if (found) return;

    if (ts.isJsxElement(node)) {
      const classAttr = node.openingElement.attributes.properties.find((prop): prop is ts.JsxAttribute => (
        ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === 'className'
      ));

      if (classAttr && getClassNameText(classAttr, sourceFile).includes(classNeedle)) {
        found = {
          node,
          start: node.getStart(sourceFile),
          end: node.getEnd(),
        };
        return;
      }
    }

    if (ts.isJsxSelfClosingElement(node)) {
      const classAttr = node.attributes.properties.find((prop): prop is ts.JsxAttribute => (
        ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === 'className'
      ));

      if (classAttr && getClassNameText(classAttr, sourceFile).includes(classNeedle)) {
        found = {
          node,
          start: node.getStart(sourceFile),
          end: node.getEnd(),
        };
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function isRangeNested(inner: JsxWithClass, outer: JsxWithClass): boolean {
  return inner.start > outer.start && inner.end < outer.end;
}

describe('TranscriptionPage structure invariants', () => {
  it('keeps transcription-list-main outside transcription-waveform-area', () => {
    // The actual component JSX lives in TranscriptionPage.Orchestrator.tsx
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const waveformArea = findFirstJsxByClassName(sourceFile, 'transcription-waveform-area');
    const listMain = findFirstJsxByClassName(sourceFile, 'transcription-list-main');

    expect(waveformArea).not.toBeNull();
    expect(listMain).not.toBeNull();

    if (!waveformArea || !listMain) return;

    expect(isRangeNested(listMain, waveformArea)).toBe(false);
    expect(listMain.start).toBeGreaterThan(waveformArea.end);
  });
});
