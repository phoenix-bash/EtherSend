import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureGuestSession } from "../../middlewares/guest-session.js";
import { requireAuth } from "../../middlewares/auth.js";
import { enforceMediaAccess } from "../../middlewares/access-control.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { HttpError } from "../../utils/http-error.js";
import { MediaRepository } from "../media/repository.js";
import { ImageLinkRepository } from "./repository.js";
import { ImageLinkService } from "./service.js";

const service = new ImageLinkService(new ImageLinkRepository(), new MediaRepository());
const storage = new LocalStorageProvider();

const mediaIdParamSchema = z.object({
  mediaId: z.string().uuid()
});

const imageIdParamSchema = z.object({
  imageId: z.string().uuid()
});

const publicImageParamSchema = z.object({
  imageId: z.string().uuid(),
  ext: z.string().min(1).max(12).regex(/^[A-Za-z0-9]+$/)
});

type Actor =
  | { kind: "user"; userId: string; role: "ADMIN" | "USER" }
  | { kind: "guest"; guestSessionId: string; requestStartMs: number };

async function resolveActor(
  app: FastifyInstance,
  request: {
    headers: Record<string, unknown>;
    cookies: Record<string, string | undefined>;
    jwtVerify: () => Promise<void>;
    user?: { sub: string; role: "ADMIN" | "USER" };
  }
): Promise<Actor> {
  if (request.headers.authorization) {
    try {
      await request.jwtVerify();
    } catch {
      throw new HttpError(401, "Invalid auth token");
    }

    return {
      kind: "user",
      userId: request.user?.sub ?? "",
      role: request.user?.role ?? "USER"
    };
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
      // Ignore invalid auth cookies and continue as guest.
    }
  }

  return {
    kind: "guest",
    guestSessionId: String(request.headers["x-guest-session-id"] ?? ""),
    requestStartMs: Date.now()
  };
}

export async function registerImageRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/images/:mediaId/link",
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
      const paramsResult = mediaIdParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid media id" });
      }

      const mediaId = paramsResult.data.mediaId;
      const media = await new MediaRepository().findById(mediaId);

      if (!media) {
        return reply.status(404).send({ error: "Media not found" });
      }

      const actor = await resolveActor(app, request);
      const allowed =
        actor.kind === "user"
          ? actor.role === "ADMIN" || media.userId === actor.userId
          : media.ownerType === "GUEST" &&
            media.guestSessionId === actor.guestSessionId &&
            Boolean(media.expiresAt) &&
            media.expiresAt!.getTime() >= actor.requestStartMs;

      if (!allowed) {
        return reply.status(403).send({ error: "Image link creation not allowed" });
      }

      await enforceMediaAccess(media.id, "view");
      const result = await service.create(mediaId);
      return reply.status(201).send(result);
    }
  );

  app.post(
    "/images/:imageId/renew",
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const paramsResult = imageIdParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid image id" });
      }

      const imageId = paramsResult.data.imageId;
      const imageLink = await new ImageLinkRepository().findById(imageId);
      if (!imageLink) {
        return reply.status(404).send({ error: "Image link not found" });
      }

      const media = await new MediaRepository().findById(imageLink.mediaFileId);
      if (!media) {
        return reply.status(404).send({ error: "Media not found" });
      }

      if (request.user.role !== "ADMIN" && media.userId !== request.user.sub) {
        return reply.status(403).send({ error: "Image link renewal not allowed" });
      }

      const renewed = await service.renew(imageId);
      return reply.send({ imageLink: renewed });
    }
  );

  app.get(
    "/i/:imageId.:ext",
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const paramsResult = publicImageParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid image link" });
      }

      const { imageId, ext } = paramsResult.data;
      const imageLink = await new ImageLinkRepository().findById(imageId);

      if (!imageLink || imageLink.extension !== ext) {
        return reply.status(404).send({ error: "Image link not found" });
      }

      if (imageLink.expiresAt.getTime() < Date.now()) {
        return reply.status(410).send({ error: "Image link expired" });
      }

      const media = await new MediaRepository().findById(imageLink.mediaFileId);
      if (!media) {
        return reply.status(404).send({ error: "Media not found" });
      }

      const stream = await storage.get(media.storagePath);
      reply.header("Content-Type", media.mimeType);
      reply.header("Cache-Control", "public, max-age=86400");
      return reply.send(stream);
    }
  );
}
