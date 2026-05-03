import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { enqueueCleanupNow, scheduleRecurringCleanup } from "../../queues/cleanup-queue.js";
import { CleanupService } from "./service.js";

function assertMaintenanceAccess(request: { headers: Record<string, unknown> }): boolean {
  if (!env.MAINTENANCE_API_KEY) {
    return false;
  }

  const providedKey = String(request.headers["x-maintenance-key"] ?? "");
  if (!providedKey) {
    return false;
  }

  const expectedBuffer = Buffer.from(env.MAINTENANCE_API_KEY, "utf8");
  const providedBuffer = Buffer.from(providedKey, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function registerCleanupRoutes(app: FastifyInstance): Promise<void> {
  const cleanupService = new CleanupService();

  app.post(
    "/internal/cleanup/expired/run",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
    if (!assertMaintenanceAccess(request as { headers: Record<string, unknown> })) {
      return reply.status(401).send({ error: "Unauthorized maintenance request" });
    }

    const summary = await cleanupService.cleanupExpiredGuestMedia(env.CLEANUP_BATCH_SIZE);
    return reply.send({ summary });
    }
  );

  app.post(
    "/internal/cleanup/expired/enqueue",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
    if (!assertMaintenanceAccess(request as { headers: Record<string, unknown> })) {
      return reply.status(401).send({ error: "Unauthorized maintenance request" });
    }

    const job = await enqueueCleanupNow("api");

    return reply.status(202).send({
      jobId: job.id,
      status: "queued"
    });
    }
  );

  app.post(
    "/internal/cleanup/scheduler/ensure",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
    if (!assertMaintenanceAccess(request as { headers: Record<string, unknown> })) {
      return reply.status(401).send({ error: "Unauthorized maintenance request" });
    }

    const scheduler = await scheduleRecurringCleanup();
    return reply.send({
      status: "ensured",
      intervalSeconds: scheduler.intervalSeconds
    });
    }
  );
}
