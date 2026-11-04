/**
 * Optional: run the background worker inside the web process (single-service hosting, e.g. a free
 * Render instance). Enable with RUN_WORKER_IN_WEB=true. For production at scale, run `npm run worker`
 * as a separate process instead. A worker failure never prevents the website from starting.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_WORKER_IN_WEB !== "true") return;
  const boot = async (attempt: number): Promise<void> => {
    try {
      const { startWorker } = await import("./worker/start");
      await startWorker();
    } catch (e) {
      const delay = Math.min(60_000, 5_000 * 2 ** attempt);
      console.error(`[worker] could not start (${(e as Error).message}); retrying in ${delay / 1000}s`);
      // A failed start must not leave a rejected cached connection behind
      (globalThis as { boss?: unknown }).boss = undefined;
      setTimeout(() => void boot(attempt + 1), delay);
    }
  };
  void boot(0);
}
