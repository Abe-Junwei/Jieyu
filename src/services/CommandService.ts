/**
 * CommandService — F7 Command-pattern undo/redo foundation
 *
 * Provides a ReversibleCommand abstraction and CommandHistory stack
 * that can be used standalone or integrated with the existing
 * useTranscriptionData snapshot-based undo system.
 */

// ── Command Interfaces ──────────────────────────────────────

/** A command that can be executed and reversed. */
export interface ReversibleCommand {
  /** Human-readable label for UI display */
  readonly label: string;
  /** Execute the forward operation */
  execute(): Promise<void>;
  /** Reverse the operation */
  undo(): Promise<void>;
}

// ── CommandHistory ──────────────────────────────────────────

export class CommandHistory {
  private undoStack: ReversibleCommand[] = [];
  private redoStack: ReversibleCommand[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  /** Execute a command and push it onto the undo stack. */
  async execute(command: ReversibleCommand): Promise<void> {
    await command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Undo the most recent command. Returns the label or null. */
  async undo(): Promise<string | null> {
    const command = this.undoStack.pop();
    if (!command) return null;
    await command.undo();
    this.redoStack.push(command);
    return command.label;
  }

  /** Redo the most recently undone command. Returns the label or null. */
  async redo(): Promise<string | null> {
    const command = this.redoStack.pop();
    if (!command) return null;
    await command.execute();
    this.undoStack.push(command);
    return command.label;
  }

  /** Undo back to a specific history index (0 = most recent). */
  async undoToIndex(targetIndex: number): Promise<number> {
    const stackIndex = this.undoStack.length - 1 - targetIndex;
    if (stackIndex < 0 || stackIndex >= this.undoStack.length) return 0;

    let count = 0;
    while (this.undoStack.length > stackIndex) {
      const label = await this.undo();
      if (!label) break;
      count++;
    }
    return count;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string {
    return this.undoStack[this.undoStack.length - 1]?.label ?? '';
  }

  get redoLabel(): string {
    return this.redoStack[this.redoStack.length - 1]?.label ?? '';
  }

  /** Get the labels of the last N undo entries (most recent first). */
  getHistory(count = 15): string[] {
    return this.undoStack.slice(-count).map((c) => c.label).reverse();
  }

  get size(): number {
    return this.undoStack.length;
  }

  get redoSize(): number {
    return this.redoStack.length;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

// ── Snapshot Command (bridges to existing approach) ─────────

/**
 * A snapshot-based command that captures before/after state.
 * This bridges the existing useTranscriptionData snapshot approach
 * with the Command pattern.
 */
export class SnapshotCommand<S> implements ReversibleCommand {
  readonly label: string;
  private readonly before: S;
  private readonly after: S;
  private readonly apply: (state: S) => Promise<void>;

  constructor(
    label: string,
    before: S,
    after: S,
    apply: (state: S) => Promise<void>,
  ) {
    this.label = label;
    this.before = before;
    this.after = after;
    this.apply = apply;
  }

  async execute(): Promise<void> {
    await this.apply(this.after);
  }

  async undo(): Promise<void> {
    await this.apply(this.before);
  }
}

// ── Batch Command ───────────────────────────────────────────

/** Combine multiple reversible commands into one atomic undo entry. */
export class BatchCommand implements ReversibleCommand {
  readonly label: string;
  private readonly commands: ReversibleCommand[];

  constructor(label: string, commands: ReversibleCommand[]) {
    this.label = label;
    this.commands = commands;
  }

  async execute(): Promise<void> {
    for (const cmd of this.commands) {
      await cmd.execute();
    }
  }

  async undo(): Promise<void> {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      await this.commands[i]!.undo();
    }
  }
}
