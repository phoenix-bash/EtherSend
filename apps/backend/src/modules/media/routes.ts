import type { FastifyInstance } from "fastify";
import type { MediaFile } from "@prisma/client";
import { z } from "zod";
import { enqueueDocumentConversion, documentConversionQueue } from "../../queues/document-conversion-queue.js";
import { requireAuth } from "../../middlewares/auth.js";
import { ensureGuestSession } from "../../middlewares/guest-session.js";
import { enforceMediaAccess } from "../../middlewares/access-control.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { HttpError } from "../../utils/http-error.js";
import { MediaRepository } from "./repository.js";
import { OfficePreviewService } from "./office-preview.service.js";
import { PdfPagePreviewService } from "./pdf-page-preview.service.js";
import { PptxSlidePreviewService } from "./pptx-slide-preview.service.js";
import { MediaService } from "./service.js";

const service = new MediaService(new MediaRepository());
const storage = new LocalStorageProvider();
const officePreviewService = new OfficePreviewService();
const pdfPagePreviewService = new PdfPagePreviewService();
const pptxSlidePreviewService = new PptxSlidePreviewService();

const mediaIdParamSchema = z.object({
  mediaId: z.string().uuid()
});

const mediaAccessQuerySchema = z.object({
  disposition: z.enum(["view", "download"]).optional()
});

const mediaSlideParamSchema = z.object({
  mediaId: z.string().uuid(),
  slideFileName: z.string().min(1)
});

const mediaPdfPageParamSchema = z.object({
  mediaId: z.string().uuid(),
  pageFileName: z.string().min(1)
});

const mediaConversionJobParamSchema = z.object({
  mediaId: z.string().uuid(),
  jobId: z.string().min(1)
});

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
  app.post(
    "/media/upload",
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
      const part = await request.file();
      if (!part) {
        return reply.status(400).send({ error: "File is required" });
      }

      let userId: string | undefined;
      if (request.headers.authorization) {
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
    }
  );

  app.post(
    "/m/:mediaId/conversion/enqueue",
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
      const mediaIdResult = mediaIdParamSchema.safeParse(request.params);
      if (!mediaIdResult.success) {
        return reply.status(400).send({ error: "Invalid media id" });
      }

      const mediaId = mediaIdResult.data.mediaId;
      await enforceMediaAccess(mediaId, "view");

      const media = await new MediaRepository().findById(mediaId);
      if (!media) {
        return reply.status(404).send({ error: "Not found" });
      }

      const jobId = await enqueueDocumentConversion(mediaId, "manual");
      return reply.status(202).send({
        mediaId,
        jobId,
        status: "queued"
      });
    }
  );

  app.get(
    "/m/:mediaId/conversion/jobs/:jobId",
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
      const parseResult = mediaConversionJobParamSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.status(400).send({ error: "Invalid conversion job path" });
      }

      const { mediaId, jobId } = parseResult.data;
      await enforceMediaAccess(mediaId, "view");

      const job = await documentConversionQueue.getJob(jobId);
      if (!job || job.data.mediaId !== mediaId) {
        return reply.status(404).send({ error: "Conversion job not found" });
      }

      const state = await job.getState();
      return reply.send({
        mediaId,
        jobId,
        state,
        result: job.returnvalue ?? null,
        failedReason: job.failedReason ?? null
      });
    }
  );

  app.post(
    "/media/:mediaId/replace",
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
      const mediaIdResult = mediaIdParamSchema.safeParse(request.params);
      if (!mediaIdResult.success) {
        return reply.status(400).send({ error: "Invalid media id" });
      }

      const mediaId = mediaIdResult.data.mediaId;
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
    }
  );

  app.patch(
    "/media/:mediaId/toggles",
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
      const mediaIdResult = mediaIdParamSchema.safeParse(request.params);
      if (!mediaIdResult.success) {
        return reply.status(400).send({ error: "Invalid media id" });
      }

      const mediaId = mediaIdResult.data.mediaId;
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
    }
  );

  app.delete(
    "/media/:mediaId",
    {
      preHandler: [ensureGuestSession],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const mediaIdResult = mediaIdParamSchema.safeParse(request.params);
      if (!mediaIdResult.success) {
        return reply.status(400).send({ error: "Invalid media id" });
      }

      const mediaId = mediaIdResult.data.mediaId;
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
    }
  );

  app.get(
    "/media",
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
    }
  );

  app.post(
    "/media/:mediaId/claim",
    {
      preHandler: [requireAuth, ensureGuestSession],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const requestStartMs = Date.now();
      const mediaIdResult = mediaIdParamSchema.safeParse(request.params);
      if (!mediaIdResult.success) {
        return reply.status(400).send({ error: "Invalid media id" });
      }

      const mediaId = mediaIdResult.data.mediaId;
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
    }
  );

  app.get(
    "/m/:mediaId/pdf-pages",
    {
      config: {
        rateLimit: {
          max: 40,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const mediaIdResult = mediaIdParamSchema.safeParse(request.params);
      if (!mediaIdResult.success) {
        return reply.status(400).send({ error: "Invalid media id" });
      }

      const mediaId = mediaIdResult.data.mediaId;
      await enforceMediaAccess(mediaId, "view");
      const media = await new MediaRepository().findById(mediaId);
      if (!media) {
        return reply.status(404).send({ error: "Not found" });
      }

      const pages = await pdfPagePreviewService.ensurePagePreview(media).catch(() => [] as string[]);
      return reply.send({
        pages: pages.map((fileName) => `/m/${mediaId}/pdf-pages/${encodeURIComponent(fileName)}`)
      });
    }
  );

  app.get(
    "/m/:mediaId/pdf-pages/:pageFileName",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parseResult = mediaPdfPageParamSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.status(400).send({ error: "Invalid page path" });
      }

      const { mediaId, pageFileName } = parseResult.data;
      await enforceMediaAccess(mediaId, "view");
      const media = await new MediaRepository().findById(mediaId);
      if (!media) {
        return reply.status(404).send({ error: "Not found" });
      }

      const page = await pdfPagePreviewService.openPageStream(media, pageFileName);
      reply.header("Content-Type", page.contentType);
      reply.header("Content-Disposition", `inline; filename=\"${pageFileName}\"`);
      return reply.send(page.stream);
    }
  );

  app.get(
    "/m/:mediaId/slides",
    {
      config: {
        rateLimit: {
          max: 40,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const mediaIdResult = mediaIdParamSchema.safeParse(request.params);
      if (!mediaIdResult.success) {
        return reply.status(400).send({ error: "Invalid media id" });
      }

      const mediaId = mediaIdResult.data.mediaId;
      await enforceMediaAccess(mediaId, "view");
      const media = await new MediaRepository().findById(mediaId);
      if (!media) {
        return reply.status(404).send({ error: "Not found" });
      }

      const slides = await pptxSlidePreviewService.ensureSlidePreview(media).catch(() => [] as string[]);
      return reply.send({
        slides: slides.map((fileName) => `/m/${mediaId}/slides/${encodeURIComponent(fileName)}`)
      });
    }
  );

  app.get(
    "/m/:mediaId/slides/:slideFileName",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parseResult = mediaSlideParamSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.status(400).send({ error: "Invalid slide path" });
      }

      const { mediaId, slideFileName } = parseResult.data;
      await enforceMediaAccess(mediaId, "view");
      const media = await new MediaRepository().findById(mediaId);
      if (!media) {
        return reply.status(404).send({ error: "Not found" });
      }

      const slide = await pptxSlidePreviewService.openSlideStream(media, slideFileName);
      reply.header("Content-Type", slide.contentType);
      reply.header("Content-Disposition", `inline; filename=\"${slideFileName}\"`);
      return reply.send(slide.stream);
    }
  );

  app.get(
    "/m/:mediaId/preview.pdf",
    {
      config: {
        rateLimit: {
          max: 40,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const mediaIdResult = mediaIdParamSchema.safeParse(request.params);
      if (!mediaIdResult.success) {
        return reply.status(400).send({ error: "Invalid media id" });
      }

      const mediaId = mediaIdResult.data.mediaId;
      await enforceMediaAccess(mediaId, "view");
      const media = await new MediaRepository().findById(mediaId);
      if (!media) {
        return reply.status(404).send({ error: "Not found" });
      }

      const previewStream = await officePreviewService.ensurePdfPreview(media);
      const filenameWithoutExt = media.filename.replace(/\.[^./\\]+$/, "") || "document";
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `inline; filename=\"${filenameWithoutExt}.pdf\"`);
      return reply.send(previewStream);
    }
  );

  app.get(
    "/m/:mediaId",
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const mediaIdResult = mediaIdParamSchema.safeParse(request.params);
      if (!mediaIdResult.success) {
        return reply.status(400).send({ error: "Invalid media id" });
      }

      const queryResult = mediaAccessQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({ error: "Invalid query" });
      }

      const mediaId = mediaIdResult.data.mediaId;
      const intent = queryResult.data.disposition ?? "view";

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
    }
  );
}
