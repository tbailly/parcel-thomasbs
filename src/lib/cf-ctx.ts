import { AsyncLocalStorage } from "node:async_hooks";

type CfCtx = { waitUntil: (p: Promise<unknown>) => void };

export const cfCtxStorage = new AsyncLocalStorage<CfCtx>();

export function isCfCtx(ctx: unknown): ctx is CfCtx {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    typeof (ctx as { waitUntil?: unknown }).waitUntil === "function"
  );
}

/**
 * Schedule a fire-and-forget promise that keeps the Cloudflare worker
 * alive past the current response. Falls back to a detached promise (which
 * may be killed early) when no ExecutionContext is available.
 */
export function backgroundTask(promise: Promise<unknown>) {
  const ctx = cfCtxStorage.getStore();
  if (ctx) {
    ctx.waitUntil(
      promise.catch((err) => {
        console.error("backgroundTask failed:", err);
      }),
    );
  } else {
    promise.catch((err) => console.error("backgroundTask (no ctx) failed:", err));
  }
}
