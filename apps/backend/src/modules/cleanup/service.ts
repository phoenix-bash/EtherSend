import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { MediaRepository } from "../media/repository.js";

export interface CleanupSummary {
  scanned: number;
  deleted: number;
  deactivated: number;
  guestUploadsCleared: number;
  sessionsCleared: number;
}

export class CleanupService {
  private readonly storage = new LocalStorageProvider();
  private readonly mediaRepository = new MediaRepository();

  async cleanupExpiredGuestMedia(limit = env.CLEANUP_BATCH_SIZE): Promise<CleanupSummary> {
    const now = new Date();
    const expired = await this.mediaRepository.listExpiredGuestMedia(limit);

    let deleted = 0;
    let deactivated = 0;

    for (const media of expired) {
      try {
        await this.storage.delete(media.storagePath);
      } catch {
        // Continue and remove metadata so expired guest content is no longer accessible.
      }

      try {
        await this.mediaRepository.hardDelete(media.id);
        deleted += 1;
      } catch {
        await this.mediaRepository.markInactive(media.id);
        deactivated += 1;
      }
    }

    const expiredGuestSessions = await prisma.guestSession.findMany({
      where: {
        expiresAt: {
          lte: now
        }
      },
      select: {
        id: true
      }
    });

    const expiredGuestUserIds = expiredGuestSessions.map((session) => `guest:${session.id}`);
    let guestUploadsCleared = 0;

    if (expiredGuestUserIds.length > 0) {
      const guestUploads = await prisma.v2Upload.findMany({
        where: {
          userId: {
            in: expiredGuestUserIds
          }
        },
        select: {
          id: true,
          s3Bucket: true,
          s3Key: true
        }
      });

      for (const upload of guestUploads) {
        if (!upload.s3Bucket || !upload.s3Key) {
          continue;
        }

        try {
          await this.storage.delete(`s3://${upload.s3Bucket}/${upload.s3Key}`);
        } catch {
        }
      }

      const deletedUploads = await prisma.v2Upload.deleteMany({
        where: {
          id: {
            in: guestUploads.map((upload) => upload.id)
          }
        }
      });
      guestUploadsCleared = deletedUploads.count;
    }

    await prisma.mediaBatch.deleteMany({
      where: {
        ownerType: "GUEST",
        guestSession: {
          expiresAt: {
            lte: now
          }
        }
      }
    });

    const clearedSessions = await prisma.guestSession.deleteMany({
      where: {
        expiresAt: {
          lte: now
        },
        mediaFiles: {
          none: {}
        }
      }
    });

    return {
      scanned: expired.length,
      deleted,
      deactivated,
      guestUploadsCleared,
      sessionsCleared: clearedSessions.count
    };
  }
}
