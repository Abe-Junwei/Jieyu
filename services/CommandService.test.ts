import { describe, it, expect } from 'vitest';
import {
  CommandHistory,
  SnapshotCommand,
  BatchCommand,
  type ReversibleCommand,
} from './CommandService';

// ── Helpers ──────────────────────────────────────────────────

function makeSimpleCommand(label: string, log: string[]): ReversibleCommand {
  return {
    label,
    execute: async () => { log.push(`exec:${label}`); },
    undo: async () => { log.push(`undo:${label}`); },
  };
}

// ── CommandHistory ──────────────────────────────────────────

describe('CommandHistory', () => {
  it('execute pushes to undo stack and clears redo', async () => {
    const log: string[] = [];
    const history = new CommandHistory();

    await history.execute(makeSimpleCommand('A', log));
    expect(log).toEqual(['exec:A']);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.undoLabel).toBe('A');
    expect(history.size).toBe(1);
  });

  it('undo pops from undo stack and pushes to redo', async () => {
    const log: string[] = [];
    const history = new CommandHistory();

    await history.execute(makeSimpleCommand('A', log));
    const label = await history.undo();

    expect(label).toBe('A');
    expect(log).toEqual(['exec:A', 'undo:A']);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(history.redoLabel).toBe('A');
  });

  it('redo re-executes and pushes back to undo', async () => {
    const log: string[] = [];
    const history = new CommandHistory();

    await history.execute(makeSimpleCommand('A', log));
    await history.undo();
    const label = await history.redo();

    expect(label).toBe('A');
    expect(log).toEqual(['exec:A', 'undo:A', 'exec:A']);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it('execute after undo clears redo stack', async () => {
    const log: string[] = [];
    const history = new CommandHistory();

    await history.execute(makeSimpleCommand('A', log));
    await history.undo();
    expect(history.canRedo).toBe(true);

    await history.execute(makeSimpleCommand('B', log));
    expect(history.canRedo).toBe(false);
    expect(history.redoSize).toBe(0);
  });

  it('respects maxSize by dropping oldest entry', async () => {
    const log: string[] = [];
    const history = new CommandHistory(3);

    await history.execute(makeSimpleCommand('A', log));
    await history.execute(makeSimpleCommand('B', log));
    await history.execute(makeSimpleCommand('C', log));
    expect(history.size).toBe(3);

    await history.execute(makeSimpleCommand('D', log));
    expect(history.size).toBe(3);

    // Oldest (A) should have been dropped
    const labels = history.getHistory();
    expect(labels).toEqual(['D', 'C', 'B']);
  });

  it('getHistory returns labels in most-recent-first order', async () => {
    const log: string[] = [];
    const history = new CommandHistory();

    await history.execute(makeSimpleCommand('A', log));
    await history.execute(makeSimpleCommand('B', log));
    await history.execute(makeSimpleCommand('C', log));

    expect(history.getHistory()).toEqual(['C', 'B', 'A']);
    expect(history.getHistory(2)).toEqual(['C', 'B']);
  });

  it('undo returns null when stack is empty', async () => {
    const history = new CommandHistory();
    const label = await history.undo();
    expect(label).toBeNull();
  });

  it('redo returns null when redo stack is empty', async () => {
    const history = new CommandHistory();
    const label = await history.redo();
    expect(label).toBeNull();
  });

  it('undoToIndex undoes multiple steps', async () => {
    const log: string[] = [];
    const history = new CommandHistory();

    await history.execute(makeSimpleCommand('A', log));
    await history.execute(makeSimpleCommand('B', log));
    await history.execute(makeSimpleCommand('C', log));

    // Undo to index 2 (= 3 steps back from top)
    const count = await history.undoToIndex(2);
    expect(count).toBe(3);
    expect(history.canUndo).toBe(false);
    expect(history.redoSize).toBe(3);

    // Verify all three were undone (in reverse order)
    expect(log).toContain('undo:C');
    expect(log).toContain('undo:B');
    expect(log).toContain('undo:A');
  });

  it('clear empties both stacks', async () => {
    const log: string[] = [];
    const history = new CommandHistory();

    await history.execute(makeSimpleCommand('A', log));
    await history.execute(makeSimpleCommand('B', log));
    await history.undo();

    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.size).toBe(0);
  });
});

// ── SnapshotCommand ─────────────────────────────────────────

describe('SnapshotCommand', () => {
  it('applies after-state on execute and before-state on undo', async () => {
    let current = 'initial';
    const apply = async (state: string) => { current = state; };

    const cmd = new SnapshotCommand('edit', 'initial', 'modified', apply);

    await cmd.execute();
    expect(current).toBe('modified');

    await cmd.undo();
    expect(current).toBe('initial');
  });

  it('preserves complex state objects', async () => {
    type State = { items: string[]; count: number };
    let current: State = { items: ['a'], count: 1 };
    const apply = async (state: State) => { current = state; };

    const before: State = { items: ['a'], count: 1 };
    const after: State = { items: ['a', 'b'], count: 2 };
    const cmd = new SnapshotCommand('add-item', before, after, apply);

    await cmd.execute();
    expect(current).toEqual({ items: ['a', 'b'], count: 2 });

    await cmd.undo();
    expect(current).toEqual({ items: ['a'], count: 1 });
  });
});

// ── BatchCommand ────────────────────────────────────────────

describe('BatchCommand', () => {
  it('executes all sub-commands in order', async () => {
    const log: string[] = [];
    const batch = new BatchCommand('batch-op', [
      makeSimpleCommand('step1', log),
      makeSimpleCommand('step2', log),
      makeSimpleCommand('step3', log),
    ]);

    await batch.execute();
    expect(log).toEqual(['exec:step1', 'exec:step2', 'exec:step3']);
  });

  it('undoes all sub-commands in reverse order', async () => {
    const log: string[] = [];
    const batch = new BatchCommand('batch-op', [
      makeSimpleCommand('step1', log),
      makeSimpleCommand('step2', log),
      makeSimpleCommand('step3', log),
    ]);

    await batch.execute();
    log.length = 0;

    await batch.undo();
    expect(log).toEqual(['undo:step3', 'undo:step2', 'undo:step1']);
  });

  it('integrates with CommandHistory', async () => {
    const log: string[] = [];
    const history = new CommandHistory();
    const batch = new BatchCommand('batch', [
      makeSimpleCommand('A', log),
      makeSimpleCommand('B', log),
    ]);

    await history.execute(batch);
    expect(history.undoLabel).toBe('batch');
    expect(log).toEqual(['exec:A', 'exec:B']);

    await history.undo();
    expect(log).toEqual(['exec:A', 'exec:B', 'undo:B', 'undo:A']);
  });
});

// ── Integration: CommandHistory + SnapshotCommand ───────────

describe('CommandHistory + SnapshotCommand integration', () => {
  it('multi-step undo/redo with snapshots preserves state correctly', async () => {
    let state = 0;
    const apply = async (s: number) => { state = s; };
    const history = new CommandHistory();

    // 0 → 1 → 2 → 3
    await history.execute(new SnapshotCommand('set-1', 0, 1, apply));
    await history.execute(new SnapshotCommand('set-2', 1, 2, apply));
    await history.execute(new SnapshotCommand('set-3', 2, 3, apply));
    expect(state).toBe(3);

    // Undo 3 → 2
    await history.undo();
    expect(state).toBe(2);

    // Undo 2 → 1
    await history.undo();
    expect(state).toBe(1);

    // Redo 1 → 2
    await history.redo();
    expect(state).toBe(2);

    // New command from state 2 — redo stack cleared
    await history.execute(new SnapshotCommand('set-10', 2, 10, apply));
    expect(state).toBe(10);
    expect(history.canRedo).toBe(false);

    // Undo 10 → 2
    await history.undo();
    expect(state).toBe(2);
  });
});
