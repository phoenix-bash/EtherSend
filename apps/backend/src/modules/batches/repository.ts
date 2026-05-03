import { Prisma, type BatchShareToken } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

const batchShareTokenModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "BatchShareToken");
const batchShareTokenFields = new Set(batchShareTokenModel?.fields.map((field) => field.name) ?? []);
const supportsHideFilenames = batchShareTokenFields.has("hideFilenames");
const supportsPasswordHash = batchShareTokenFields.has("passwordHash");
const supportsPreviewViewLimit = batchShareTokenFields.has("previewViewLimit");

const batchWithItemsInclude = {
  user: {
    select: {
      name: true,
      email: true
    }
  },
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
      user: {
        select: {
          name: true,
          email: true
        }
      },
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
  hideFilenames?: boolean;
  passwordHash?: string | null;
  previewViewLimit?: number | null;
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

  async deleteBatch(batchId: string): Promise<void> {
    await prisma.mediaBatch.delete({
      where: { id: batchId }
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

  createShareToken(
    batchId: string,
    token: string,
    allowDownload: boolean,
    hideFilenames: boolean,
    passwordHash: string | null,
    previewViewLimit: number | null,
    expiresAt: Date
  ): Promise<BatchShareToken> {
    if (hideFilenames && !supportsHideFilenames) {
      throw new Error("hideFilenames is not supported by the current Prisma client");
    }

    if (passwordHash && !supportsPasswordHash) {
      throw new Error("passwordHash is not supported by the current Prisma client");
    }

    if (previewViewLimit !== null && previewViewLimit !== undefined && !supportsPreviewViewLimit) {
      throw new Error("previewViewLimit is not supported by the current Prisma client");
    }

    const data: Record<string, unknown> = {
      batchId,
      token,
      allowDownload,
      expiresAt
    };

    if (supportsHideFilenames) {
      data.hideFilenames = hideFilenames;
    }

    if (supportsPasswordHash) {
      data.passwordHash = passwordHash;
    }

    if (supportsPreviewViewLimit) {
      data.previewViewLimit = previewViewLimit;
    }

    return prisma.batchShareToken.create({
      data: data as Prisma.BatchShareTokenUncheckedCreateInput
    });
  }

  updateShareToken(batchId: string, input: UpdateBatchShareInput): Promise<BatchShareToken> {
    if (input.hideFilenames === true && !supportsHideFilenames) {
      throw new Error("hideFilenames is not supported by the current Prisma client");
    }

    if (input.passwordHash !== undefined && input.passwordHash !== null && !supportsPasswordHash) {
      throw new Error("passwordHash is not supported by the current Prisma client");
    }

    if (input.previewViewLimit !== undefined && input.previewViewLimit !== null && !supportsPreviewViewLimit) {
      throw new Error("previewViewLimit is not supported by the current Prisma client");
    }

    const data: Record<string, unknown> = {
      allowDownload: input.allowDownload,
      expiresAt: input.expiresAt
    };

    if (supportsHideFilenames && input.hideFilenames !== undefined) {
      data.hideFilenames = input.hideFilenames;
    }

    if (supportsPasswordHash && input.passwordHash !== undefined) {
      data.passwordHash = input.passwordHash;
    }

    if (supportsPreviewViewLimit && input.previewViewLimit !== undefined) {
      data.previewViewLimit = input.previewViewLimit;
    }

    return prisma.batchShareToken.update({
      where: { batchId },
      data: data as Prisma.BatchShareTokenUncheckedUpdateInput
    });
  }

  findShareByToken(token: string): Promise<BatchShareWithBatch | null> {
    return prisma.batchShareToken.findUnique({
      where: { token },
      include: shareWithBatchInclude
    });
  }

  countPreviewViewsForShareFile(token: string, mediaFileId: string): Promise<number> {
    return prisma.accessLog.count({
      where: {
        action: `BATCH_SHARE_PREVIEW:${token}`,
        mediaFileId
      }
    });
  }

  createPreviewViewLog(token: string, mediaFileId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    return prisma.accessLog
      .create({
        data: {
          mediaFileId,
          action: `BATCH_SHARE_PREVIEW:${token}`,
          ipAddress,
          userAgent
        }
      })
      .then(() => undefined);
  }
}
