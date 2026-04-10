import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { enqueueCleanupNow, scheduleRecurringCleanup } from "../../queues/cleanup-queue.js";
import { CleanupService } from "./service.js";

function assertMaintenanceAccess(request: { headers: Record<string, unknown> }): boolean {
  if (!env.MAINTENANCE_API_KEY) {
    return true;
  }

  return request.headers["x-maintenance-key"] === env.MAINTENANCE_API_KEY;
}

export async function registerCleanupRoutes(app: FastifyInstance): Promise<void> {
  const cleanupService = new CleanupService();

  app.post("/internal/cleanup/expired/run", async (request, reply) => {
    if (!assertMaintenanceAccess(request as { headers: Record<string, unknown> })) {
      return reply.status(401).send({ error: "Unauthorized maintenance request" });
    }

    const summary = await cleanupService.cleanupExpiredGuestMedia(env.CLEANUP_BATCH_SIZE);
    return reply.send({ summary });
  });

  app.post("/internal/cleanup/expired/enqueue", async (request, reply) => {
    if (!assertMaintenanceAccess(request as { headers: Record<string, unknown> })) {
      return reply.status(401).send({ error: "Unauthorized maintenance request" });
    }

    const job = await enqueueCleanupNow("api");

    return reply.status(202).send({
      jobId: job.id,
      status: "queued"
    });
  });

  app.post("/internal/cleanup/scheduler/ensure", async (request, reply) => {
    if (!assertMaintenanceAccess(request as { headers: Record<string, unknown> })) {
      return reply.status(401).send({ error: "Unauthorized maintenance request" });
    }

    const scheduler = await scheduleRecurringCleanup();
    return reply.send({
      status: "ensured",
      intervalSeconds: scheduler.intervalSeconds
    });
  });
}
