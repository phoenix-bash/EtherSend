import { HttpError } from "../../utils/http-error.js";
import { MediaRepository } from "../media/repository.js";
import { ImageLinkRepository } from "./repository.js";

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

export class ImageLinkService {
  constructor(
    private readonly imageRepo: ImageLinkRepository,
    private readonly mediaRepo: MediaRepository
  ) {}

  async create(mediaFileId: string) {
    const media = await this.mediaRepo.findById(mediaFileId);
    if (!media) {
      throw new HttpError(404, "Media not found");
    }

    if (!media.mimeType.startsWith("image/")) {
      throw new HttpError(400, "Only image media can be mapped to image links");
    }

    const extension = media.extension || "bin";
    const expiresAt = new Date(Date.now() + SIX_MONTHS_MS);

    const link = await this.imageRepo.create(media.id, extension, expiresAt);
    return {
      link,
      directUrl: `/i/${link.id}.${extension}`
    };
  }

  async renew(imageLinkId: string) {
    const expiresAt = new Date(Date.now() + SIX_MONTHS_MS);
    return this.imageRepo.renew(imageLinkId, expiresAt);
  }
}
