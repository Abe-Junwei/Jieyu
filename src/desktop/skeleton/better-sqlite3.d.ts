declare module 'better-sqlite3' {
  export interface RunResult {
    lastInsertRowid: number | bigint;
  }

  export interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
  }

  export interface Database {
    exec(source: string): this;
    prepare(source: string): Statement;
    transaction<F extends (...args: never[]) => unknown>(fn: F): F;
    close(): void;
  }

  interface DatabaseConstructor {
    new (filename: string): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
