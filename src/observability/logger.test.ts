import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, addLogObserver, setLogLevel, type LogEntry } from './logger';

describe('createLogger', () => {
  beforeEach(() => {
    setLogLevel('debug');
  });

  it('emits log entries to observer', () => {
    const entries: LogEntry[] = [];
    const unsub = addLogObserver((e) => entries.push(e));

    const log = createLogger('TestModule');
    log.info('hello', { key: 'val' });

    expect(entries).toHaveLength(1);
    expect(entries[0]!.module).toBe('TestModule');
    expect(entries[0]!.level).toBe('info');
    expect(entries[0]!.message).toBe('hello');
    expect(entries[0]!.data).toEqual({ key: 'val' });
    expect(entries[0]!.ts).toBeTruthy();

    unsub();
  });

  it('filters by log level', () => {
    const entries: LogEntry[] = [];
    const unsub = addLogObserver((e) => entries.push(e));

    setLogLevel('warn');
    const log = createLogger('Test');
    log.debug('ignored');
    log.info('ignored');
    log.warn('visible');
    log.error('visible');

    expect(entries).toHaveLength(2);
    expect(entries[0]!.level).toBe('warn');
    expect(entries[1]!.level).toBe('error');

    unsub();
  });

  it('unsubscribes observer', () => {
    const entries: LogEntry[] = [];
    const unsub = addLogObserver((e) => entries.push(e));
    unsub();

    createLogger('X').info('nope');
    expect(entries).toHaveLength(0);
  });

  it('time() returns durationMs and emits info log', async () => {
    const entries: LogEntry[] = [];
    const unsub = addLogObserver((e) => entries.push(e));

    const log = createLogger('Perf');
    const stop = log.time('op');
    await new Promise((r) => setTimeout(r, 20));
    const dur = stop();

    expect(dur).toBeGreaterThanOrEqual(15);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toContain('op');
    expect(entries[0]!.data?.durationMs).toBe(dur);

    unsub();
  });

  it('does not crash when observer throws', () => {
    const unsub = addLogObserver(() => { throw new Error('boom'); });
    const log = createLogger('Safe');

    expect(() => log.info('test')).not.toThrow();

    unsub();
  });

  it('uses the current console binding at emit time', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    createLogger('PatchedConsole').error('visible to spy');

    expect(consoleErrorSpy).toHaveBeenCalledWith('[PatchedConsole]', 'visible to spy');
    consoleErrorSpy.mockRestore();
  });
});
