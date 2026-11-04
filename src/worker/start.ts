import { getBoss, QUEUES } from "@/server/queue";
import { runJob } from "@/server/research/jobs";
import { deadlineSweep, runDueMonitoringRules } from "@/server/monitoring";

/** Starts queue consumers and schedules. Used by the standalone worker and (optionally) inside the web process. */
export async function startWorker() {
  const boss = await getBoss();
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);
  for (let i = 0; i < concurrency; i++) {
    await boss.work<{ jobId: string }>(QUEUES.research, { batchSize: 1 }, async ([job]) => {
      console.log(`[worker] research job ${job.data.jobId}`);
      await runJob(job.data.jobId);
    });
  }
  await boss.work(QUEUES.monitor, async () => {
    const ids = await runDueMonitoringRules();
    if (ids.length) console.log(`[worker] monitoring created ${ids.length} job(s)`);
  });
  await boss.work(QUEUES.sweep, async () => {
    console.log("[worker] deadline sweep", await deadlineSweep());
  });
  await boss.schedule(QUEUES.monitor, "*/15 * * * *");
  await boss.schedule(QUEUES.sweep, "0 * * * *");
  console.log(`[worker] ready (concurrency ${concurrency})`);
  return boss;
}
