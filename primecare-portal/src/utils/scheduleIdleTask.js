/**
 * Schedule non-critical work after first paint (requestIdleCallback with timeout fallback).
 * @param {() => void | Promise<void>} task
 * @param {{ timeout?: number }} [options]
 * @returns {() => void} cancel
 */
export function scheduleIdleTask(task, options = {}) {
  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : 2000;
  let cancelled = false;

  const run = () => {
    if (cancelled) return;
    void Promise.resolve().then(task);
  };

  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(run, { timeout });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }

  const id = window.setTimeout(run, 0);
  return () => {
    cancelled = true;
    window.clearTimeout(id);
  };
}
