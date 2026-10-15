import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
// @ts-expect-error — .mjs guard script without type declarations
import { adrRecordFailures, codeDriftWarnings, codePathFailures, docLocationFailures, localLinkFailures, requiresCitation, specTasksFailures, uncitedDocFailures } from './check-docs-governance.mjs';

const adrPath = join(process.cwd(), 'docs/adr/0001-example.md');

describe('adrRecordFailures', () => {
  it('rejects a status outside accepted or superseded', () => {
    const failures = adrRecordFailures(adrPath, '---\nstatus: active\n---\n# x\n');
    expect(failures[0]).toContain('accepted or superseded');
  });

  it('rejects a superseded ADR whose replacement link does not exist', () => {
    const failures = adrRecordFailures(
      adrPath,
      '---\nstatus: superseded\n---\n\nSee [next](./missing.md).\n',
      () => false,
    );
    expect(failures[0]).toContain('must link to an existing ADR');
  });

  it('accepts a superseded ADR that links to another ADR', () => {
    const failures = adrRecordFailures(
      adrPath,
      '---\nstatus: superseded\n---\n\nSee [next](./0049-decisions-not-current-state-inventories.md).\n',
      (candidate: string) => candidate.endsWith('0049-decisions-not-current-state-inventories.md'),
    );
    expect(failures).toEqual([]);
  });
});

describe('localLinkFailures', () => {
  it('reports a broken relative link in an entry file', () => {
    const entry = join(process.cwd(), 'README.md');
    const failures = localLinkFailures(entry, 'See [gone](docs/execution/no-such-file.md).\n', () => false);
    expect(failures[0]).toContain('broken link target');
  });

  it('ignores external URLs', () => {
    const entry = join(process.cwd(), 'README.md');
    const failures = localLinkFailures(entry, 'See [web](https://example.com/x).\n', () => false);
    expect(failures).toEqual([]);
  });
});

describe('docLocationFailures', () => {
  it('rejects markdown outside the known doc locations', () => {
    expect(docLocationFailures('docs/execution/archive/old.md')[0]).toContain('not a known doc location');
    expect(docLocationFailures('docs/GLOSSARY.md')).toHaveLength(1);
  });

  it('accepts spec trios and wayfinder tickets', () => {
    expect(docLocationFailures('docs/execution/specs/foo/tasks.md')).toEqual([]);
    expect(docLocationFailures('docs/wayfinder/trial-handoff/tickets/001-x.md')).toEqual([]);
  });
});

describe('specTasksFailures', () => {
  it('asks to delete a spec whose tasks are all checked', () => {
    const failures = specTasksFailures('docs/execution/specs/foo/tasks.md', '- [x] a\n- [x] 不适用：b\n');
    expect(failures[0]).toContain('delete docs/execution/specs/foo/');
  });

  it('keeps a spec with an open task and ignores the template', () => {
    expect(specTasksFailures('docs/execution/specs/foo/tasks.md', '- [x] a\n- [ ] b\n')).toEqual([]);
    expect(specTasksFailures('docs/execution/specs/_template/tasks.md', '')).toEqual([]);
  });
});

describe('codePathFailures', () => {
  it('reports a backtick path that does not exist', () => {
    const failures = codePathFailures('AGENTS.md', 'See `src/gone/file.ts:12`.\n', () => false);
    expect(failures).toEqual(['AGENTS.md: path `src/gone/file.ts` does not exist']);
  });

  it('skips placeholders and ban lines', () => {
    const source = 'Put it in `src/pages/useXxxController.ts`.\n不建 `src/hooks/index.ts` barrel.\n';
    expect(codePathFailures('AGENTS.md', source, () => false)).toEqual([]);
  });
});

describe('uncitedDocFailures', () => {
  it('flags a ledger no code, script or entry file names', () => {
    const failures = uncitedDocFailures(
      ['docs/execution/governance/a-ledger.md', 'docs/execution/governance/b-ledger.md'],
      ['// see docs/execution/governance/a-ledger.md'],
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('b-ledger.md');
  });

  it('exempts directory READMEs', () => {
    expect(requiresCitation('docs/execution/governance/README.md')).toBe(false);
    expect(requiresCitation('docs/architecture/x.md')).toBe(true);
  });
});

describe('codeDriftWarnings', () => {
  it('warns when named code changed but the doc did not', () => {
    const docs = [{ relativePath: 'docs/architecture/x.md', source: 'Uses `src/a.ts` and `docs/y.md`.' }];
    expect(codeDriftWarnings(new Set(['src/a.ts', 'docs/y.md']), docs)).toEqual(['docs/architecture/x.md names src/a.ts']);
    expect(codeDriftWarnings(new Set(['src/a.ts', 'docs/architecture/x.md']), docs)).toEqual([]);
  });
});
