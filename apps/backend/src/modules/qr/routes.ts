import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import { requireAuth } from "../../middlewares/auth.js";
import { MediaRepository } from "../media/repository.js";
import { QrRepository } from "./repository.js";

export async function registerQrRoutes(app: FastifyInstance): Promise<void> {
  app.post("/qr/:mediaId", { preHandler: [requireAuth] }, async (request, reply) => {
    const mediaId = (request.params as { mediaId: string }).mediaId;
    const media = await new MediaRepository().findById(mediaId);

    if (!media) {
      return reply.status(404).send({ error: "Media not found" });
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
  });

  app.get("/q/:token", async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const qrToken = await new QrRepository().findByToken(token);

    if (!qrToken) {
      return reply.status(404).send({ error: "QR token not found" });
    }

    if (qrToken.expiresAt.getTime() < Date.now()) {
      return reply.status(410).send({ error: "QR token expired" });
    }

    return reply.redirect(`/m/${qrToken.mediaFileId}`);
  });
}
