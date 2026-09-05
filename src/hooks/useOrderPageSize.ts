import { useCallback, useState } from "react";

export const ORDER_PAGE_SIZE_OPTIONS = [20, 50, 100, 150, 200] as const;
export const DEFAULT_ORDER_PAGE_SIZE = 100;

function isSupportedPageSize(value: number): boolean {
  return ORDER_PAGE_SIZE_OPTIONS.some((option) => option === value);
}

function readStoredPageSize(storageKey: string): number {
  try {
    const storedValue = Number(window.localStorage.getItem(storageKey));
    return isSupportedPageSize(storedValue) ? storedValue : DEFAULT_ORDER_PAGE_SIZE;
  } catch {
    return DEFAULT_ORDER_PAGE_SIZE;
  }
}

export function useOrderPageSize(storageKey: string): [number, (pageSize: number) => void] {
  const [pageSize, setPageSize] = useState(() => readStoredPageSize(storageKey));

  const updatePageSize = useCallback((nextPageSize: number) => {
    if (!isSupportedPageSize(nextPageSize)) return;
    setPageSize(nextPageSize);
    try {
      window.localStorage.setItem(storageKey, String(nextPageSize));
    } catch {
      // Persistence is optional; the in-memory selection still works.
    }
  }, [storageKey]);

  return [pageSize, updatePageSize];
}
