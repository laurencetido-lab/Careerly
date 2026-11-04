import PgBoss from "pg-boss";

export const QUEUES = { research: "research-job", monitor: "monitor-tick", sweep: "deadline-sweep" } as const;

const g = globalThis as unknown as { boss?: Promise<PgBoss> };

export function getBoss() {
  if (!g.boss) {
    g.boss = (async () => {
      const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
      boss.on("error", (e) => console.error("[queue]", e));
      await boss.start();
      for (const q of Object.values(QUEUES)) await boss.createQueue(q);
      return boss;
    })();
  }
  return g.boss;
}

export async function enqueueResearchJob(jobId: string) {
  const boss = await getBoss();
  await boss.send(QUEUES.research, { jobId }, { retryLimit: 3, retryDelay: 30, retryBackoff: true, singletonKey: jobId, expireInSeconds: 60 * 60 * 4 });
}
