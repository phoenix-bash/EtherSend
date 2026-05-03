import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import { z } from "zod";
import { requireAuth } from "../../middlewares/auth.js";
import { MediaRepository } from "../media/repository.js";
import { QrRepository } from "./repository.js";

const mediaIdParamSchema = z.object({
  mediaId: z.string().uuid()
});

const qrTokenParamSchema = z.object({
  token: z.string().length(32).regex(/^[A-Fa-f0-9]+$/)
});

export async function registerQrRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/qr/:mediaId",
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 20,
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

      if (request.user.role !== "ADMIN" && media.userId !== request.user.sub) {
        return reply.status(403).send({ error: "QR generation not allowed" });
      }

      const tenMinutesMs = 10 * 60 * 1000;
      const now = Date.now();
      const mediaExpiryMs = media.expiresAt ? media.expiresAt.getTime() : now + tenMinutesMs;
      const ttlMs = Math.max(1000, Math.min(tenMinutesMs, mediaExpiryMs - now));

      const token = randomUUID().replace(/-/g, "");
      const qrToken = await new QrRepository().create(mediaId, token, new Date(now + ttlMs));
      const redirectUrl = `${app.prefix || ""}/q/${qrToken.token}`;
      const qrDataUrl = await QRCode.toDataURL(`${request.protocol}://${request.hostname}${redirectUrl}`);

      return reply.status(201).send({
        token: qrToken.token,
        expiresAt: qrToken.expiresAt,
        redirectUrl,
        qrDataUrl
      });
    }
  );

  app.get(
    "/q/:token",
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const paramsResult = qrTokenParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({ error: "Invalid QR token" });
      }

      const token = paramsResult.data.token;
      const qrToken = await new QrRepository().findByToken(token);

      if (!qrToken) {
        return reply.status(404).send({ error: "QR token not found" });
      }

      if (qrToken.expiresAt.getTime() < Date.now()) {
        return reply.status(410).send({ error: "QR token expired" });
      }

      return reply.redirect(`/m/${qrToken.mediaFileId}`);
    }
  );
}
