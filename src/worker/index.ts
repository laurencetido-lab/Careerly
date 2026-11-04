/**
 * Careerly background worker. Run separately from the web server: `npm run worker`.
 * Research continues independently of browser sessions.
 */
import { startWorker } from "./start";

startWorker()
  .then((boss) => {
    const stop = async () => {
      await boss.stop({ graceful: true, timeout: 30000 });
      process.exit(0);
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
