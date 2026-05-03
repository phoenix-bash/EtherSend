import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { ensureGuestSession } from "../../middlewares/guest-session.js";
import { HttpError } from "../../utils/http-error.js";
import { GuestService } from "../guest/service.js";
import { MediaRepository } from "../media/repository.js";
import { V2UploadRepository } from "./repository.js";
import { V2UploadService } from "./service.js";
import type { UploadActor } from "./types.js";
import { V2S3Service } from "./services/s3.service.js";
import { uploadAbortBodySchema, uploadChunkBodySchema, uploadCompleteBodySchema, uploadInitBodySchema } from "./validation.js";

const guestService = new GuestService();
const service = new V2UploadService(new V2UploadRepository(), new V2S3Service(), guestService, new MediaRepository());

function resolveV2BasePaths(): string[] {
  const configuredPrefix = env.V2_API_PREFIX.trim();

  if (configuredPrefix === "/api/v2") {
    return ["/api/v2", "/v2"];
  }

  return [configuredPrefix];
}

function assertGuestSessionId(request: FastifyRequest): string {
  const guestSessionId = String(request.headers["x-guest-session-id"] ?? "");

  if (!guestSessionId) {
    throw new HttpError(401, "Guest session not found");
  }

  return guestSessionId;
}

async function resolveActor(request: FastifyRequest): Promise<UploadActor> {
  if (request.headers.authorization) {
    try {
      await request.jwtVerify();
      return {
        userId: request.user.sub,
        isGuest: false
      };
    } catch {
      // Fall through to guest actor.
    }
  }

  const guestSessionId = assertGuestSessionId(request);
  return {
    userId: guestSessionId,
    isGuest: true,
    guestSessionId
  };
}

export async function registerV2UploadRoutes(app: FastifyInstance): Promise<void> {
  if (!env.ENABLE_V2_UPLOAD) {
    return;
  }

  const paths = resolveV2BasePaths();

  for (const basePath of paths) {
    app.post(
      `${basePath}/upload/init`,
      {
        preHandler: [ensureGuestSession],
        config: {
          rateLimit: {
            max: 30,
            timeWindow: "1 minute"
          }
        }
      },
      async (request, reply) => {
        const parseResult = uploadInitBodySchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: "Invalid upload init payload",
            details: parseResult.error.flatten()
          });
        }

        const actor = await resolveActor(request);
        const result = await service.initUpload(parseResult.data, actor);
        return reply.status(201).send(result);
      }
    );

    app.post(
      `${basePath}/upload/complete`,
      {
        preHandler: [ensureGuestSession],
        config: {
          rateLimit: {
            max: 30,
            timeWindow: "1 minute"
          }
        }
      },
      async (request, reply) => {
        const parseResult = uploadCompleteBodySchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: "Invalid upload complete payload",
            details: parseResult.error.flatten()
          });
        }

        const actor = await resolveActor(request);
        const result = await service.completeUpload(parseResult.data, actor);
        return reply.send(result);
      }
    );

    app.post(
      `${basePath}/upload/abort`,
      {
        preHandler: [ensureGuestSession],
        config: {
          rateLimit: {
            max: 30,
            timeWindow: "1 minute"
          }
        }
      },
      async (request, reply) => {
        const parseResult = uploadAbortBodySchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: "Invalid upload abort payload",
            details: parseResult.error.flatten()
          });
        }

        const actor = await resolveActor(request);
        const result = await service.abortUpload(parseResult.data, actor);
        return reply.send(result);
      }
    );

    app.post(
      `${basePath}/upload/chunk`,
      {
        preHandler: [ensureGuestSession],
        config: {
          rateLimit: {
            max: 60,
            timeWindow: "1 minute"
          }
        }
      },
      async (request, reply) => {
        const parseResult = uploadChunkBodySchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: "Invalid chunk URL payload",
            details: parseResult.error.flatten()
          });
        }

        const actor = await resolveActor(request);
        const result = await service.createChunkUrl(parseResult.data, actor);
        return reply.send(result);
      }
    );
  }
}
