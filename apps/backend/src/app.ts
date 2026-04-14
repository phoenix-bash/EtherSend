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
import { scheduleRecurringCleanup } from "./queues/cleanup-queue.js";

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

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug"
    }
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
    timeWindow: "1 minute"
  });

  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_BYTES
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  await registerAuthRoutes(app);
  await registerMediaRoutes(app);
  await registerImageRoutes(app);
  await registerQrRoutes(app);
  await registerBatchRoutes(app);
  await registerActivityRoutes(app);
  await registerCleanupRoutes(app);

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
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";

    request.log.error(error);
    return reply.status(statusCode).send({
      error: errorMessage,
      requestId: request.id
    });
  });

  return app;
}
