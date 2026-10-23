/**
 * 渲染进程上的存储接口代理。每个方法一次调用，方法名用点连接（ADR-0079）。
 * 事务留在主进程那一次调用里，不跨调用持有。
 */
import type { StoragePort } from './storagePort';

const STORAGE_METHOD = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/;

export function callStorageMethod(
  port: object,
  method: string,
  args: readonly unknown[],
): Promise<unknown> {
  if (!STORAGE_METHOD.test(method)) {
    return Promise.reject(new Error(`unknown storage method ${method}`));
  }
  const parts = method.split('.');
  let parent: object = port;
  let current: unknown = port;
  for (const part of parts) {
    if (part === 'constructor' || part === 'prototype') {
      return Promise.reject(new Error(`unknown storage method ${method}`));
    }
    if (typeof current !== 'object' || current === null) {
      return Promise.reject(new Error(`unknown storage method ${method}`));
    }
    parent = current;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== 'function') {
    return Promise.reject(new Error(`unknown storage method ${method}`));
  }
  return Promise.resolve(Reflect.apply(current, parent, [...args]));
}

export function createIpcStoragePort(
  invoke: (method: string, args: readonly unknown[]) => Promise<unknown>,
): StoragePort {
  function bind(method: string): (...args: unknown[]) => Promise<unknown> {
    const call = (...args: unknown[]) => invoke(method, args);
    return new Proxy(call, {
      get(target, prop, receiver) {
        if (typeof prop !== 'string') return Reflect.get(target, prop, receiver);
        return bind(`${method}.${prop}`);
      },
    });
  }

  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        return bind(prop);
      },
    },
  ) as unknown as StoragePort;
}
