import type { ImageLink } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

export class ImageLinkRepository {
  create(mediaFileId: string, extension: string, expiresAt: Date): Promise<ImageLink> {
    return prisma.imageLink.create({
      data: {
        mediaFileId,
        extension,
        expiresAt
      }
    });
  }

  findById(id: string): Promise<ImageLink | null> {
    return prisma.imageLink.findUnique({ where: { id } });
  }

  renew(id: string, expiresAt: Date): Promise<ImageLink> {
    return prisma.imageLink.update({
      where: { id },
      data: { expiresAt }
    });
  }
}
