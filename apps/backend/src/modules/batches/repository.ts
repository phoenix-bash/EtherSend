import { Prisma, type BatchShareToken } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

const batchWithItemsInclude = {
  items: {
    include: {
      mediaFile: true
    },
    orderBy: {
      createdAt: "asc"
    }
  },
  shareToken: true
} satisfies Prisma.MediaBatchInclude;

const shareWithBatchInclude = {
  batch: {
    include: {
      items: {
        include: {
          mediaFile: true
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  }
} satisfies Prisma.BatchShareTokenInclude;

export type MediaBatchWithItems = Prisma.MediaBatchGetPayload<{
  include: typeof batchWithItemsInclude;
}>;

export type BatchShareWithBatch = Prisma.BatchShareTokenGetPayload<{
  include: typeof shareWithBatchInclude;
}>;

const batchListInclude = {
  shareToken: true,
  _count: {
    select: {
      items: true
    }
  }
} satisfies Prisma.MediaBatchInclude;

export type MediaBatchListItem = Prisma.MediaBatchGetPayload<{
  include: typeof batchListInclude;
}>;

interface CreateBatchInput {
  ownerType: "USER" | "GUEST";
  userId?: string;
  guestSessionId?: string;
  name?: string;
  mediaIds: string[];
}

interface UpdateBatchShareInput {
  allowDownload?: boolean;
  expiresAt?: Date;
}

export class BatchRepository {
  findMediaByIds(mediaIds: string[]) {
    return prisma.mediaFile.findMany({
      where: {
        id: {
          in: mediaIds
        }
      }
    });
  }

  createBatch(input: CreateBatchInput): Promise<MediaBatchWithItems> {
    return prisma.mediaBatch.create({
      data: {
        ownerType: input.ownerType,
        userId: input.userId,
        guestSessionId: input.guestSessionId,
        name: input.name,
        items: {
          create: input.mediaIds.map((mediaFileId) => ({ mediaFileId }))
        }
      },
      include: batchWithItemsInclude
    });
  }

  findBatchById(batchId: string): Promise<MediaBatchWithItems | null> {
    return prisma.mediaBatch.findUnique({
      where: { id: batchId },
      include: batchWithItemsInclude
    });
  }

  listByUser(userId: string, role: "ADMIN" | "USER", limit = 100): Promise<MediaBatchListItem[]> {
    return prisma.mediaBatch.findMany({
      where: role === "ADMIN" ? undefined : { ownerType: "USER", userId },
      include: batchListInclude,
      orderBy: {
        createdAt: "desc"
      },
      take: limit
    });
  }

  listByGuest(guestSessionId: string, limit = 100): Promise<MediaBatchListItem[]> {
    return prisma.mediaBatch.findMany({
      where: {
        ownerType: "GUEST",
        guestSessionId
      },
      include: batchListInclude,
      orderBy: {
        createdAt: "desc"
      },
      take: limit
    });
  }

  createShareToken(batchId: string, token: string, allowDownload: boolean, expiresAt: Date): Promise<BatchShareToken> {
    return prisma.batchShareToken.create({
      data: {
        batchId,
        token,
        allowDownload,
        expiresAt
      }
    });
  }

  updateShareToken(batchId: string, input: UpdateBatchShareInput): Promise<BatchShareToken> {
    return prisma.batchShareToken.update({
      where: { batchId },
      data: {
        allowDownload: input.allowDownload,
        expiresAt: input.expiresAt
      }
    });
  }

  findShareByToken(token: string): Promise<BatchShareWithBatch | null> {
    return prisma.batchShareToken.findUnique({
      where: { token },
      include: shareWithBatchInclude
    });
  }
}
