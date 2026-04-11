import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { MediaRepository } from "../media/repository.js";

export interface CleanupSummary {
  scanned: number;
  deleted: number;
  deactivated: number;
  sessionsCleared: number;
}

export class CleanupService {
  private readonly storage = new LocalStorageProvider();
  private readonly mediaRepository = new MediaRepository();

  async cleanupExpiredGuestMedia(limit = env.CLEANUP_BATCH_SIZE): Promise<CleanupSummary> {
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

    const clearedSessions = await prisma.guestSession.deleteMany({
      where: {
        expiresAt: {
          lte: new Date()
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
      sessionsCleared: clearedSessions.count
    };
  }
}
