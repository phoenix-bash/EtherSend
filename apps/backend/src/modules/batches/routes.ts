import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureGuestSession } from "../../middlewares/guest-session.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";
import { BatchRepository } from "./repository.js";
import { type BatchActor, BatchService } from "./service.js";

const service = new BatchService(new BatchRepository());
const storage = new LocalStorageProvider();

const createBatchSchema = z.object({
  mediaIds: z.array(z.string().uuid()).min(1).max(200),
  name: z.string().min(1).max(120).optional()
});

const createShareSchema = z.object({
  allowDownload: z.boolean().optional()
});

const updateShareSchema = z.object({
  allowDownload: z.boolean()
});

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveRequestBaseUrl(request: {
  headers: Record<string, unknown>;
  protocol: string;
  hostname: string;
}): string | null {
  const originHeader = String(request.headers.origin ?? "").trim();
  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      if (!isLoopbackHostname(originUrl.hostname)) {
        return normalizeBaseUrl(originUrl.toString());
      }
    } catch {
      // Ignore malformed origin headers.
    }
  }

  const forwardedHost = String(request.headers["x-forwarded-host"] ?? "")
    .split(",")[0]
    ?.trim();
  if (forwardedHost) {
    const forwardedProto =
      String(request.headers["x-forwarded-proto"] ?? "")
        .split(",")[0]
        ?.trim() || request.protocol;
    return normalizeBaseUrl(`${forwardedProto}://${forwardedHost}`);
  }

  const hostHeader = String(request.headers.host ?? "").trim();
  if (hostHeader && !isLoopbackHostname(request.hostname)) {
    return normalizeBaseUrl(`${request.protocol}://${hostHeader}`);
  }

  return null;
}

function resolveFrontendBaseUrl(request: {
  headers: Record<string, unknown>;
  protocol: string;
  hostname: string;
}): string {
  const configuredBase = normalizeBaseUrl(env.FRONTEND_BASE_URL);

  try {
    const parsedConfigured = new URL(configuredBase);
    if (!isLoopbackHostname(parsedConfigured.hostname)) {
      return configuredBase;
    }
  } catch {
    return configuredBase;
  }

  return resolveRequestBaseUrl(request) ?? configuredBase;
}

function buildPublicShareUrl(
  request: { headers: Record<string, unknown>; protocol: string; hostname: string },
  publicPath: string
): string {
  const base = resolveFrontendBaseUrl(request);
  const path = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  return `${base}${path}`;
}

async function resolveActor(
  app: FastifyInstance,
  request: {
    headers: Record<string, unknown>;
    cookies: Record<string, string | undefined>;
    jwtVerify: () => Promise<void>;
    user?: { sub: string; role: "ADMIN" | "USER" };
  }
): Promise<BatchActor> {
  if (request.headers.authorization) {
    try {
      await request.jwtVerify();
      return {
        kind: "user",
        userId: request.user?.sub ?? "",
        role: request.user?.role ?? "USER"
      };
    } catch {
      // Guest-capable routes should degrade gracefully when bearer tokens are stale.
    }
  }

  const cookieToken = request.cookies.lf_access_token;
  if (cookieToken) {
    try {
      const payload = app.jwt.verify(cookieToken) as { sub: string; role: "ADMIN" | "USER" };
      return {
        kind: "user",
        userId: payload.sub,
        role: payload.role
      };
    } catch {
      // Fall back to guest actor if auth cookie is invalid.
    }
  }

  return {
    kind: "guest",
    guestSessionId: String(request.headers["x-guest-session-id"] ?? ""),
    requestStartMs: Date.now()
  };
}

export async function registerBatchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/batches", { preHandler: [ensureGuestSession] }, async (request) => {
    const actor = await resolveActor(app, request);
    const result = await service.listBatches(actor);

    return {
      items: result.items.map((item) => ({
        ...item,
        share: item.share
          ? {
              ...item.share,
              publicUrl: buildPublicShareUrl(request, item.share.publicPath)
            }
          : null
      }))
    };
  });

  app.post("/batches", { preHandler: [ensureGuestSession] }, async (request, reply) => {
    const parsed = createBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const actor = await resolveActor(app, request);
    const batch = await service.createBatch(actor, parsed.data.mediaIds, parsed.data.name);

    return reply.status(201).send({
      batch: {
        id: batch.id,
        name: batch.name,
        ownerType: batch.ownerType,
        mediaIds: batch.items.map((item) => item.mediaFileId),
        createdAt: batch.createdAt
      }
    });
  });

  app.post("/batches/:batchId/share", { preHandler: [ensureGuestSession] }, async (request, reply) => {
    const batchId = (request.params as { batchId: string }).batchId;
    const parsed = createShareSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const actor = await resolveActor(app, request);
    const share = await service.createOrRefreshShare(batchId, actor, parsed.data.allowDownload);

    return reply.status(201).send({
      share: {
        ...share,
        publicUrl: buildPublicShareUrl(request, share.publicPath)
      }
    });
  });

  app.patch("/batches/:batchId/share", { preHandler: [ensureGuestSession] }, async (request, reply) => {
    const batchId = (request.params as { batchId: string }).batchId;
    const parsed = updateShareSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const actor = await resolveActor(app, request);
    const share = await service.updateShareSettings(batchId, actor, parsed.data.allowDownload);
    return reply.send({
      share: {
        ...share,
        publicUrl: buildPublicShareUrl(request, share.publicPath)
      }
    });
  });

  app.get("/shares/:token", async (request) => {
    const token = (request.params as { token: string }).token;
    const share = await service.getPublicShare(token);

    const firstFileId = share.batch.files[0]?.id;
    if (firstFileId) {
      void prisma.accessLog
        .create({
          data: {
            mediaFileId: firstFileId,
            action: "BATCH_SHARE_VIEW",
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"]
          }
        })
        .catch(() => {
          // Activity tracking should never break public share responses.
        });
    }

    return share;
  });

  app.get("/shares/:token/files/:mediaId", async (request, reply) => {
    const { token, mediaId } = request.params as { token: string; mediaId: string };
    const disposition = ((request.query as { disposition?: string }).disposition || "view") as "view" | "download";

    if (disposition !== "view" && disposition !== "download") {
      return reply.status(400).send({ error: "Invalid disposition" });
    }

    const media = await service.resolveSharedMedia(token, mediaId, disposition);
    const stream = await storage.get(media.storagePath);

    reply.header("Content-Type", media.mimeType);
    reply.header(
      "Content-Disposition",
      `${disposition === "download" ? "attachment" : "inline"}; filename=\"${media.filename}\"`
    );

    return reply.send(stream);
  });
}
