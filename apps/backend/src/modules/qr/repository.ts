import type { QrToken } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

export class QrRepository {
  create(mediaFileId: string, token: string, expiresAt: Date): Promise<QrToken> {
    return prisma.qrToken.create({
      data: {
        mediaFileId,
        token,
        expiresAt
      }
    });
  }

  findByToken(token: string): Promise<QrToken | null> {
    return prisma.qrToken.findUnique({ where: { token } });
  }
}
