import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createLogger } from '../observability/logger';

const log = createLogger('useLocalStorage');

/**
 * useLocalStorage - Hook for syncing state with window.localStorage
 * 
 * @param key The localStorage key
 * @param initialValue Default value to use if no value is found in localStorage
 * @returns A tuple with the current value and a setter function
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void, () => void] {
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      log.warn('error reading localStorage key', { key, err: error });
      return initialValue;
    }
  });
  const storedValueRef = useRef(storedValue);

  useLayoutEffect(() => {
    storedValueRef.current = storedValue;
  }, [storedValue]);

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValueRef.current) : value;

      storedValueRef.current = valueToStore;
      setStoredValue(valueToStore);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      log.warn('error setting localStorage key', { key, err: error });
    }
  }, [key]);

  const removeValue = useCallback(() => {
    try {
      storedValueRef.current = initialValue;
      setStoredValue(initialValue);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      log.warn('error removing localStorage key', { key, err: error });
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
