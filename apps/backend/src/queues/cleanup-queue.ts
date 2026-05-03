import { type JobsOptions, Queue, Worker } from "bullmq";
import * as IORedis from "ioredis";
import { env } from "../config/env.js";
import { CleanupService, type CleanupSummary } from "../modules/cleanup/service.js";

export const CLEANUP_QUEUE_NAME = "cleanup-expired-media";
export const CLEANUP_JOB_NAME = "cleanup-expired-media";
export const CLEANUP_SCHEDULER_ID = "cleanup-expired-media-recurring";

export interface CleanupJobData {
  trigger: string;
  requestedAt: string;
}

type QueueWithScheduler = Queue<CleanupJobData, CleanupSummary, typeof CLEANUP_JOB_NAME> & {
  upsertJobScheduler?: (
    schedulerId: string,
    repeat: { every: number },
    jobTemplate: {
      name: typeof CLEANUP_JOB_NAME;
      data: CleanupJobData;
      opts?: JobsOptions;
    }
  ) => Promise<unknown>;
};

const connection = new IORedis.Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const defaultJobOptions: JobsOptions = {
  removeOnComplete: true,
  removeOnFail: false
};

export const cleanupQueue = new Queue<CleanupJobData, CleanupSummary, typeof CLEANUP_JOB_NAME>(
  CLEANUP_QUEUE_NAME,
  { connection }
);

export function enqueueCleanupNow(trigger = "manual") {
  return cleanupQueue.add(
    CLEANUP_JOB_NAME,
    {
      trigger,
      requestedAt: new Date().toISOString()
    },
    defaultJobOptions
  );
}

export async function scheduleRecurringCleanup(): Promise<{ intervalSeconds: number }> {
  const everyMs = env.CLEANUP_INTERVAL_SECONDS * 1000;
  const queueWithScheduler = cleanupQueue as QueueWithScheduler;

  if (typeof queueWithScheduler.upsertJobScheduler === "function") {
    await queueWithScheduler.upsertJobScheduler(
      CLEANUP_SCHEDULER_ID,
      { every: everyMs },
      {
        name: CLEANUP_JOB_NAME,
        data: {
          trigger: "recurring",
          requestedAt: new Date().toISOString()
        },
        opts: defaultJobOptions
      }
    );
  } else {
    await cleanupQueue.add(
      CLEANUP_JOB_NAME,
      {
        trigger: "recurring",
        requestedAt: new Date().toISOString()
      },
      {
        ...defaultJobOptions,
        jobId: CLEANUP_SCHEDULER_ID,
        repeat: { every: everyMs }
      }
    );
  }

  return { intervalSeconds: env.CLEANUP_INTERVAL_SECONDS };
}

export function createCleanupWorker(): Worker<CleanupJobData, CleanupSummary, typeof CLEANUP_JOB_NAME> {
  const service = new CleanupService();

  return new Worker(
    CLEANUP_QUEUE_NAME,
    async () => {
      return service.cleanupExpiredGuestMedia(env.CLEANUP_BATCH_SIZE);
    },
    { connection }
  );
}
