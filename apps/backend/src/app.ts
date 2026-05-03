import fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { HttpError } from "./utils/http-error.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerMediaRoutes } from "./modules/media/routes.js";
import { registerImageRoutes } from "./modules/image-links/routes.js";
import { registerQrRoutes } from "./modules/qr/routes.js";
import { registerBatchRoutes } from "./modules/batches/routes.js";
import { registerActivityRoutes } from "./modules/activity/routes.js";
import { registerCleanupRoutes } from "./modules/cleanup/routes.js";
import { registerDominatorRoutes } from "./modules/dominator/routes.js";
import { registerV2UploadRoutes } from "./modules/v2-upload/routes.js";
import { scheduleRecurringCleanup } from "./queues/cleanup-queue.js";
import { createDocumentConversionWorker } from "./queues/document-conversion-queue.js";

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function isPrivateIpv4Hostname(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }

  const octets = match.slice(1).map((segment) => Number(segment));
  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }

  return octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return isLoopbackHostname(normalized) || isPrivateIpv4Hostname(normalized) || normalized.endsWith(".local");
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const normalizedFrontendOrigin = normalizeOrigin(env.FRONTEND_BASE_URL);
const isFrontendPrivateOrigin = (() => {
  try {
    return isPrivateHostname(new URL(env.FRONTEND_BASE_URL).hostname);
  } catch {
    return false;
  }
})();

const allowedCorsOrigins = new Set<string>(
  [normalizedFrontendOrigin, ...env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => normalizeOrigin(origin.trim()))].filter(
    (origin): origin is string => Boolean(origin)
  )
);

function resolveRequestOrigin(headers: Record<string, unknown>): string | null {
  const origin = String(headers.origin ?? "").trim();
  if (origin) {
    return normalizeOrigin(origin);
  }

  const referer = String(headers.referer ?? "").trim();
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function hasCookieAuth(headers: Record<string, unknown>): boolean {
  const rawCookie = String(headers.cookie ?? "");
  if (!rawCookie) {
    return false;
  }

  return (
    rawCookie.includes("lf_access_token=") ||
    rawCookie.includes("lf_refresh_token=") ||
    rawCookie.includes("lf_guest=") ||
    rawCookie.includes("lf_admin_session=")
  );
}

function isStateChangingMethod(method: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod !== "GET" && normalizedMethod !== "HEAD" && normalizedMethod !== "OPTIONS";
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({ logger: true });
  const documentConversionWorker = createDocumentConversionWorker();

  documentConversionWorker.on("completed", (job, result) => {
    app.log.info({ jobId: job.id, mediaId: job.data.mediaId, result }, "Document conversion job completed");
  });

  documentConversionWorker.on("failed", (job, error) => {
    app.log.error({ jobId: job?.id, mediaId: job?.data.mediaId, err: error }, "Document conversion job failed");
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.NODE_ENV !== "production") {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      if (!normalizedOrigin) {
        callback(null, false);
        return;
      }

      if (allowedCorsOrigins.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      if (isFrontendPrivateOrigin) {
        try {
          const originUrl = new URL(normalizedOrigin);
          callback(null, isPrivateHostname(originUrl.hostname));
          return;
        } catch {
          callback(null, false);
          return;
        }
      }

      callback(null, false);
    },
    credentials: true
  });

  await app.register(helmet, {
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  });
  await app.register(cookie, {
    secret: env.GUEST_SESSION_SECRET,
    hook: "onRequest"
  });

  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: {
      expiresIn: "15m"
    }
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: () => {
      return {
        error: "Too many requests",
        details: {
          code: "RATE_LIMITED"
        }
      };
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    if (env.NODE_ENV !== "production") {
      return;
    }

    if (!isStateChangingMethod(request.method)) {
      return;
    }

    if (!hasCookieAuth(request.headers)) {
      return;
    }

    const requestOrigin = resolveRequestOrigin(request.headers);
    if (!requestOrigin || !allowedCorsOrigins.has(requestOrigin)) {
      return reply.status(403).send({
        error: "CSRF validation failed",
        details: {
          code: "CSRF_BLOCKED"
        }
      });
    }
  });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("X-Content-Type-Options", "nosniff");
  });

  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_BYTES
    }
  });

  app.get(
    "/health",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute"
        }
      }
    },
    async () => ({ status: "ok" })
  );

  app.get(
    "/limits",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute"
        }
      }
    },
    async () => ({
      guestStorageCapBytes: env.MAX_UPLOAD_BYTES,
      signedInStorageCapBytes: env.SIGNED_IN_MAX_TOTAL_BYTES
    })
  );

  await registerAuthRoutes(app);
  await registerMediaRoutes(app);
  await registerImageRoutes(app);
  await registerQrRoutes(app);
  await registerBatchRoutes(app);
  await registerActivityRoutes(app);
  await registerCleanupRoutes(app);
  await registerDominatorRoutes(app);
  await registerV2UploadRoutes(app);

  try {
    const scheduler = await scheduleRecurringCleanup();
    app.log.info({ intervalSeconds: scheduler.intervalSeconds }, "Recurring cleanup scheduler ensured");
  } catch (error) {
    app.log.error({ err: error }, "Failed to ensure recurring cleanup scheduler");
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        details: error.details,
        requestId: request.id
      });
    }

    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    const errorMessage =
      env.NODE_ENV === "production" ? "Internal Server Error" : error instanceof Error ? error.message : "Internal Server Error";

    request.log.error(error);
    return reply.status(statusCode).send({
      error: errorMessage,
      requestId: request.id
    });
  });

  app.addHook("onClose", async () => {
    await documentConversionWorker.close();
  });

  return app;
}
