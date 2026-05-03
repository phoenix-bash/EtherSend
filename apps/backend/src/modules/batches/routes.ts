import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureGuestSession } from "../../middlewares/guest-session.js";
import { getShareEmailProvider } from "../../providers/email/index.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";
import { OfficePreviewService } from "../media/office-preview.service.js";
import { BatchRepository } from "./repository.js";
import { type BatchActor, BatchService } from "./service.js";

const service = new BatchService(new BatchRepository(), getShareEmailProvider());
const storage = new LocalStorageProvider();
const officePreviewService = new OfficePreviewService();

const createBatchSchema = z.object({
  mediaIds: z.array(z.string().uuid()).min(1).max(200),
  name: z.string().min(1).max(120).optional()
});

const createShareSchema = z.object({
  allowDownload: z.boolean().optional(),
  hideFilenames: z.boolean().optional(),
  password: z.string().max(256).optional(),
  previewViewLimit: z.coerce.number().int().min(1).max(5).optional(),
  expiresAt: z.coerce.date().optional(),
  durationMinutes: z.coerce.number().int().positive().optional()
});

const updateShareSchema = z.object({
  allowDownload: z.boolean(),
  hideFilenames: z.boolean().optional(),
  password: z.string().max(256).optional(),
  previewViewLimit: z.coerce.number().int().min(1).max(5).optional()
});

const shareEmailSchema = z.object({
  recipientEmail: z.string().email(),
  timeZone: z.string().trim().min(1).max(100).optional()
});

const batchIdParamSchema = z.object({
  batchId: z.string().uuid()
});

const shareTokenParamSchema = z.object({
  token: z.string().length(32).regex(/^[A-Fa-f0-9]+$/)
});

const sharedMediaParamSchema = z.object({
  token: z.string().length(32).regex(/^[A-Fa-f0-9]+$/),
  mediaId: z.string().uuid()
});

const sharedMediaQuerySchema = z.object({
  disposition: z.enum(["view", "download"]).optional()
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

  return null;
}

function resolveFrontendBaseUrl(request: {
  headers: Record<string, unknown>;
  protocol: string;
  hostname: string;
}): string {
  const requestBase = resolveRequestBaseUrl(request);
  if (requestBase) {
    return requestBase;
  }

  const configuredBase = normalizeBaseUrl(env.FRONTEND_BASE_URL);
  return configuredBase;
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
  app.get(
    "/batches",
    {
      preHandler: [ensureGuestSession],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute"
        }
      }
    },
    async (request) => {
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
    }
  );

  app.post(
    "/batches",
    {
      preHandler: [ensureGuestSession],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
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
    }
  );

  app.delete(
    "/batches/:batchId",
    {
      preHandler: [ensureGuestSession],
      config: {
        rateLimit: {
          max: 12,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const paramsResult = batchIdParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid batch id" });
      }

      const actor = await resolveActor(app, request);
      await service.deleteBatch(paramsResult.data.batchId, actor);
      return reply.status(204).send();
    }
  );

  app.post(
    "/batches/:batchId/share",
    {
      preHandler: [ensureGuestSession],
      config: {
        rateLimit: {
          max: 15,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const paramsResult = batchIdParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid batch id" });
      }

      const parsed = createShareSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const actor = await resolveActor(app, request);
      const share = await service.createOrRefreshShare(
        paramsResult.data.batchId,
        actor,
        parsed.data.allowDownload,
        parsed.data.hideFilenames,
        parsed.data.password,
        parsed.data.previewViewLimit,
        {
          expiresAt: parsed.data.expiresAt,
          durationMinutes: parsed.data.durationMinutes
        }
      );

      return reply.status(201).send({
        share: {
          ...share,
          publicUrl: buildPublicShareUrl(request, share.publicPath)
        }
      });
    }
  );

  app.patch(
    "/batches/:batchId/share",
    {
      preHandler: [ensureGuestSession],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const paramsResult = batchIdParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid batch id" });
      }

      const parsed = updateShareSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const actor = await resolveActor(app, request);
      const share = await service.updateShareSettings(
        paramsResult.data.batchId,
        actor,
        parsed.data.allowDownload,
        parsed.data.hideFilenames,
        parsed.data.password,
        parsed.data.previewViewLimit
      );
      return reply.send({
        share: {
          ...share,
          publicUrl: buildPublicShareUrl(request, share.publicPath)
        }
      });
    }
  );

  app.post(
    "/batches/:batchId/share/email",
    {
      preHandler: [ensureGuestSession],
      config: {
        rateLimit: {
          max: 6,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const paramsResult = batchIdParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid batch id" });
      }

      const parsed = shareEmailSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const actor = await resolveActor(app, request);
      const frontendBaseUrl = resolveFrontendBaseUrl(request);
      const result = await service.sendShareEmail(
        paramsResult.data.batchId,
        actor,
        parsed.data.recipientEmail,
        frontendBaseUrl,
        parsed.data.timeZone
      );
      return reply.status(201).send({
        ok: true,
        expiresAt: result.expiresAt,
        hasPassword: result.hasPassword
      });
    }
  );

  app.get(
    "/shares/:token",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
          keyGenerator: (request: { ip: string; params: unknown; headers: Record<string, unknown> }) => {
            const token = String((request.params as { token?: string })?.token ?? "");
            const hasPasswordHeader = String(request.headers["x-share-password"] ?? "").length > 0;
            return `${request.ip}:${token}:${hasPasswordHeader ? "pwd" : "nopwd"}`;
          }
        }
      }
    },
    async (request, reply) => {
      const paramsResult = shareTokenParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid share token" });
      }

      const token = paramsResult.data.token;
      const providedPassword = String(request.headers["x-share-password"] ?? "");
      const share = await service.getPublicShare(token, providedPassword || undefined);

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
    }
  );

  app.get(
    "/shares/:token/files/:mediaId/preview.pdf",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
          keyGenerator: (request: { ip: string; params: unknown; headers: Record<string, unknown> }) => {
            const token = String((request.params as { token?: string })?.token ?? "");
            const hasPasswordHeader = String(request.headers["x-share-password"] ?? "").length > 0;
            return `${request.ip}:${token}:preview:${hasPasswordHeader ? "pwd" : "nopwd"}`;
          }
        }
      }
    },
    async (request, reply) => {
      const paramsResult = sharedMediaParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid share request" });
      }

      const { token, mediaId } = paramsResult.data;
      const providedPassword = String(request.headers["x-share-password"] ?? "");
      const trackPreviewView = String(request.headers["x-share-preview-intent"] ?? "") === "1";
      const { media, hideFilenames } = await service.resolveSharedMedia(token, mediaId, "view", providedPassword || undefined, {
        trackPreviewView,
        ipAddress: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "") || undefined
      });
      const previewStream = await officePreviewService.ensurePdfPreview(media);
      const filenameWithoutExt = hideFilenames ? "shared-file" : media.filename.replace(/\.[^./\\]+$/, "") || "document";

      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `inline; filename=\"${filenameWithoutExt}.pdf\"`);
      return reply.send(previewStream);
    }
  );

  app.get(
    "/shares/:token/files/:mediaId",
    {
      config: {
        rateLimit: {
          max: 40,
          timeWindow: "1 minute",
          keyGenerator: (request: { ip: string; params: unknown; headers: Record<string, unknown> }) => {
            const token = String((request.params as { token?: string })?.token ?? "");
            const hasPasswordHeader = String(request.headers["x-share-password"] ?? "").length > 0;
            return `${request.ip}:${token}:${hasPasswordHeader ? "pwd" : "nopwd"}`;
          }
        }
      }
    },
    async (request, reply) => {
      const paramsResult = sharedMediaParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid share request" });
      }

      const queryResult = sharedMediaQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({ error: "Invalid query" });
      }

      const { token, mediaId } = paramsResult.data;
      const disposition = queryResult.data.disposition ?? "view";
      const providedPassword = String(request.headers["x-share-password"] ?? "");
      const trackPreviewView = disposition === "view" && String(request.headers["x-share-preview-intent"] ?? "") === "1";
      const { media, hideFilenames } = await service.resolveSharedMedia(token, mediaId, disposition, providedPassword || undefined, {
        trackPreviewView,
        ipAddress: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "") || undefined
      });
      const stream = await storage.get(media.storagePath);
      const resolvedFilename = hideFilenames ? "shared-file" : media.filename;

      reply.header("Content-Type", media.mimeType);
      reply.header(
        "Content-Disposition",
        `${disposition === "download" ? "attachment" : "inline"}; filename="${resolvedFilename}"`
      );

      return reply.send(stream);
    }
  );
}
