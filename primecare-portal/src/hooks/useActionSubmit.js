import { useCallback, useRef, useState } from "react";

/**
 * Duplicate-submit protection + busy state for sync or async actions.
 */
export function useActionSubmit() {
  const [busyKey, setBusyKey] = useState("");
  const lockRef = useRef(false);

  const run = useCallback(async (key, fn) => {
    if (lockRef.current) return { skipped: true };
    lockRef.current = true;
    setBusyKey(key);
    try {
      const result = await fn();
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err };
    } finally {
      lockRef.current = false;
      setBusyKey("");
    }
  }, []);

  const isBusy = useCallback((key) => Boolean(key && busyKey === key), [busyKey]);

  return { run, busyKey, isBusy, isAnyBusy: Boolean(busyKey) };
}
