import type { FastifyInstance } from "fastify";
import type { MediaFile } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../../middlewares/auth.js";
import { ensureGuestSession } from "../../middlewares/guest-session.js";
import { enforceMediaAccess } from "../../middlewares/access-control.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { HttpError } from "../../utils/http-error.js";
import { MediaRepository } from "./repository.js";
import { MediaService } from "./service.js";

const service = new MediaService(new MediaRepository());
const storage = new LocalStorageProvider();

function serializeMedia(media: MediaFile) {
  return {
    ...media,
    sizeBytes: media.sizeBytes.toString()
  };
}

type Actor =
  | { kind: "user"; userId: string; role: "ADMIN" | "USER" }
  | { kind: "guest"; guestSessionId: string; requestStartMs: number };

async function resolveActor(request: {
  headers: Record<string, unknown>;
  jwtVerify: () => Promise<void>;
  user?: { sub: string; role: "ADMIN" | "USER" };
}): Promise<Actor> {
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

  return {
    kind: "guest",
    guestSessionId: String(request.headers["x-guest-session-id"] ?? ""),
    requestStartMs: Date.now()
  };
}

function canMutateMedia(media: MediaFile, actor: Actor): boolean {
  if (actor.kind === "user") {
    return actor.role === "ADMIN" || media.userId === actor.userId;
  }

  return Boolean(media.ownerType === "GUEST" && media.guestSessionId === actor.guestSessionId);
}

export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  app.post("/media/upload", { preHandler: [ensureGuestSession] }, async (request, reply) => {
    const part = await request.file();
    if (!part) {
      return reply.status(400).send({ error: "File is required" });
    }

    const authHeader = request.headers.authorization;
    let userId: string | undefined;

    if (authHeader) {
      try {
        await request.jwtVerify();
        userId = request.user.sub;
      } catch {
        userId = undefined;
      }
    }

    const guestSessionId = userId ? undefined : String(request.headers["x-guest-session-id"] || "");
    const media = await service.upload({ file: part, userId, guestSessionId });
    return reply.status(201).send({ media: serializeMedia(media) });
  });

  app.post("/media/:mediaId/replace", { preHandler: [ensureGuestSession] }, async (request, reply) => {
    const mediaId = (request.params as { mediaId: string }).mediaId;
    const part = await request.file();

    if (!part) {
      return reply.status(400).send({ error: "File is required" });
    }

    const actor = await resolveActor(request);
    const mediaRecord = await new MediaRepository().findById(mediaId);
    if (!mediaRecord) {
      return reply.status(404).send({ error: "Media not found" });
    }

    if (!canMutateMedia(mediaRecord, actor)) {
      return reply.status(403).send({ error: "Replace not allowed" });
    }

    const media = await service.replace(mediaId, part);
    return reply.send({ media: serializeMedia(media) });
  });

  app.patch("/media/:mediaId/toggles", { preHandler: [ensureGuestSession] }, async (request, reply) => {
    const mediaId = (request.params as { mediaId: string }).mediaId;
    const schema = z.object({
      isActive: z.boolean().optional(),
      allowDownload: z.boolean().optional()
    });

    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: "Invalid payload" });
    }

    const actor = await resolveActor(request);
    const mediaRecord = await new MediaRepository().findById(mediaId);
    if (!mediaRecord) {
      return reply.status(404).send({ error: "Media not found" });
    }

    if (!canMutateMedia(mediaRecord, actor)) {
      return reply.status(403).send({ error: "Toggle update not allowed" });
    }

    const media = await new MediaRepository().setToggles(mediaId, parseResult.data);
    return reply.send({ media: serializeMedia(media) });
  });

  app.delete("/media/:mediaId", { preHandler: [ensureGuestSession] }, async (request, reply) => {
    const mediaId = (request.params as { mediaId: string }).mediaId;
    const actor = await resolveActor(request);
    const repo = new MediaRepository();
    const media = await repo.findById(mediaId);

    if (!media) {
      return reply.status(404).send({ error: "Media not found" });
    }

    if (!canMutateMedia(media, actor)) {
      return reply.status(403).send({ error: "Delete not allowed" });
    }

    await storage.delete(media.storagePath);
    await repo.hardDelete(media.id);
    return reply.status(204).send();
  });

  app.get("/media", { preHandler: [ensureGuestSession] }, async (request, reply) => {
    const actor = await resolveActor(request);
    const repo = new MediaRepository();
    const items =
      actor.kind === "user"
        ? await repo.listByUser(actor.userId, actor.role, 50)
        : await repo.listByGuest(actor.guestSessionId, actor.requestStartMs, 50);

    if (actor.kind === "guest" && !request.headers.authorization && !request.cookies.lf_access_token) {
      reply.header("x-linkforge-actor", "guest");
    }

    return { items: items.map(serializeMedia) };
  });

  app.post("/media/:mediaId/claim", { preHandler: [requireAuth, ensureGuestSession] }, async (request, reply) => {
    const requestStartMs = Date.now();
    const mediaId = (request.params as { mediaId: string }).mediaId;
    const guestSessionId = String(request.headers["x-guest-session-id"] || "");
    const repo = new MediaRepository();
    const media = await repo.findById(mediaId);

    if (!media) {
      return reply.status(404).send({ error: "Media not found" });
    }

    if (media.guestSessionId !== guestSessionId || !media.expiresAt || media.expiresAt.getTime() < requestStartMs) {
      return reply.status(403).send({ error: "Claim not allowed" });
    }

    const claimed = await repo.claimToUser(mediaId, request.user.sub);
    return reply.send({ media: serializeMedia(claimed) });
  });

  app.get("/m/:mediaId", async (request, reply) => {
    const mediaId = (request.params as { mediaId: string }).mediaId;
    const intent = ((request.query as { disposition?: string }).disposition || "view") as "view" | "download";

    await enforceMediaAccess(mediaId, intent);
    const media = await new MediaRepository().findById(mediaId);

    if (!media) {
      return reply.status(404).send({ error: "Not found" });
    }

    const stream = await storage.get(media.storagePath);
    const disposition = intent === "download" ? "attachment" : "inline";
    reply.header("Content-Type", media.mimeType);
    reply.header("Content-Disposition", `${disposition}; filename=\"${media.filename}\"`);
    return reply.send(stream);
  });
}
