import type { MediaFile, OwnerType } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

export interface CreateMediaRecordInput {
  ownerType: OwnerType;
  userId?: string;
  guestSessionId?: string;
  filename: string;
  mimeType: string;
  extension?: string;
  sizeBytes: bigint;
  storagePath: string;
  expiresAt?: Date;
}

export class MediaRepository {
  create(input: CreateMediaRecordInput): Promise<MediaFile> {
    return prisma.mediaFile.create({
      data: input
    });
  }

  findById(id: string): Promise<MediaFile | null> {
    return prisma.mediaFile.findUnique({ where: { id } });
  }

  list(limit = 20): Promise<MediaFile[]> {
    return prisma.mediaFile.findMany({
      orderBy: { createdAt: "desc" },
      take: limit
    });
  }

  listByUser(userId: string, role: "ADMIN" | "USER", limit = 50): Promise<MediaFile[]> {
    return prisma.mediaFile.findMany({
      where: role === "ADMIN" ? undefined : { ownerType: "USER", userId },
      orderBy: { createdAt: "desc" },
      take: limit
    });
  }

  listByGuest(guestSessionId: string, requestStartMs: number, limit = 50): Promise<MediaFile[]> {
    return prisma.mediaFile.findMany({
      where: {
        ownerType: "GUEST",
        guestSessionId,
        expiresAt: {
          gte: new Date(requestStartMs)
        }
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
  }

  async updateContent(
    id: string,
    data: { storagePath: string; sizeBytes: bigint; mimeType: string; filename?: string; extension?: string }
  ): Promise<MediaFile> {
    const updated = await prisma.mediaFile.update({
      where: { id },
      data: {
        storagePath: data.storagePath,
        sizeBytes: data.sizeBytes,
        mimeType: data.mimeType,
        filename: data.filename,
        extension: data.extension
      }
    });

    const versionsCount = await prisma.mediaVersion.count({ where: { mediaFileId: id } });
    await prisma.mediaVersion.create({
      data: {
        mediaFileId: id,
        versionNo: versionsCount + 1,
        storagePath: data.storagePath,
        sizeBytes: data.sizeBytes,
        mimeType: data.mimeType
      }
    });

    return updated;
  }

  setToggles(id: string, input: { isActive?: boolean; allowDownload?: boolean }): Promise<MediaFile> {
    return prisma.mediaFile.update({
      where: { id },
      data: {
        isActive: input.isActive,
        allowDownload: input.allowDownload
      }
    });
  }

  async hardDelete(id: string): Promise<void> {
    await prisma.mediaFile.delete({ where: { id } });
  }

  listExpiredGuestMedia(limit = 100): Promise<MediaFile[]> {
    return prisma.mediaFile.findMany({
      where: {
        ownerType: "GUEST",
        expiresAt: {
          lte: new Date()
        }
      },
      orderBy: {
        expiresAt: "asc"
      },
      take: limit
    });
  }

  markInactive(id: string): Promise<MediaFile> {
    return prisma.mediaFile.update({
      where: { id },
      data: {
        isActive: false
      }
    });
  }

  async claimToUser(id: string, userId: string): Promise<MediaFile> {
    return prisma.mediaFile.update({
      where: { id },
      data: {
        ownerType: "USER",
        userId,
        guestSessionId: null,
        claimStatus: "CLAIMED",
        claimedByUserId: userId,
        expiresAt: null
      }
    });
  }
}
