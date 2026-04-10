import { env } from "../../config/env.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { MediaRepository } from "../media/repository.js";

export interface CleanupSummary {
  scanned: number;
  deleted: number;
  deactivated: number;
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
        await this.mediaRepository.hardDelete(media.id);
        deleted += 1;
      } catch {
        await this.mediaRepository.markInactive(media.id);
        deactivated += 1;
      }
    }

    return {
      scanned: expired.length,
      deleted,
      deactivated
    };
  }
}
