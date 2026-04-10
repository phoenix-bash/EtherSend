import { createCleanupWorker } from "../queues/cleanup-queue.js";

const worker = createCleanupWorker();

worker.on("completed", (job, result) => {
  // eslint-disable-next-line no-console
  console.log(`Cleanup job completed: ${job.id}`, result);
});

worker.on("failed", (job, error) => {
  // eslint-disable-next-line no-console
  console.error(`Cleanup job failed: ${job?.id ?? "unknown"}`, error);
});

// eslint-disable-next-line no-console
console.log("Cleanup worker started");
