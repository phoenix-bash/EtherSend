import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../middlewares/auth.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { MediaRepository } from "../media/repository.js";
import { ImageLinkRepository } from "./repository.js";
import { ImageLinkService } from "./service.js";

const service = new ImageLinkService(new ImageLinkRepository(), new MediaRepository());
const storage = new LocalStorageProvider();

export async function registerImageRoutes(app: FastifyInstance): Promise<void> {
  app.post("/images/:mediaId/link", { preHandler: [requireAuth] }, async (request, reply) => {
    const mediaId = (request.params as { mediaId: string }).mediaId;
    const result = await service.create(mediaId);
    return reply.status(201).send(result);
  });

  app.post("/images/:imageId/renew", { preHandler: [requireAuth] }, async (request, reply) => {
    const imageId = (request.params as { imageId: string }).imageId;
    const renewed = await service.renew(imageId);
    return reply.send({ imageLink: renewed });
  });

  app.get("/i/:imageId.:ext", async (request, reply) => {
    const { imageId, ext } = request.params as { imageId: string; ext: string };
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
  });
}
