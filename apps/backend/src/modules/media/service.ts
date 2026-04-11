import { extname } from "node:path";
import type { MultipartFile } from "@fastify/multipart";
import type { OwnerType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { lookup as lookupMime } from "mime-types";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { HttpError } from "../../utils/http-error.js";
import { GuestService } from "../guest/service.js";
import { MediaRepository } from "./repository.js";

const storage = new LocalStorageProvider();
const guestService = new GuestService();
const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

interface UploadMediaInput {
  file: MultipartFile;
  userId?: string;
  guestSessionId?: string;
}

export class MediaService {
  constructor(private readonly repository: MediaRepository) {}

  private async assertSignedInCanStore(userId: string, fileBytes: number, excludeMediaId?: string): Promise<void> {
    const usage = await prisma.mediaFile.aggregate({
      where: {
        ownerType: "USER",
        userId,
        ...(excludeMediaId
          ? {
              id: {
                not: excludeMediaId
              }
            }
          : {})
      },
      _sum: {
        sizeBytes: true
      }
    });

    const currentBytes = usage._sum.sizeBytes ?? 0n;
    const projectedBytes = currentBytes + BigInt(Math.max(0, fileBytes));

    if (projectedBytes > BigInt(env.SIGNED_IN_MAX_TOTAL_BYTES)) {
      throw new HttpError(413, "Signed-in storage limit reached");
    }
  }

  private async resolveSignedInExpiry(userId: string): Promise<Date> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (user?.accountType === "SUBSCRIPTION" && user.planValidUntil && user.planValidUntil.getTime() > Date.now()) {
      return user.planValidUntil;
    }

    return new Date(Date.now() + SIX_MONTHS_MS);
  }

  async upload(input: UploadMediaInput) {
    const extension = extname(input.file.filename || "").replace(".", "").toLowerCase() || undefined;
    const ownerType: OwnerType = input.userId ? "USER" : "GUEST";

    const mimeType = input.file.mimetype || lookupMime(input.file.filename || "") || "application/octet-stream";
    const mediaId = randomUUID();
    const storagePath = `media/${mediaId}/v1-${input.file.filename}`;

    if (ownerType === "GUEST" && input.guestSessionId) {
      await guestService.assertGuestCanUpload(input.guestSessionId, 0);
    }

    await storage.upload({
      stream: input.file.file,
      path: storagePath
    });

    const fileBytes = Math.max(0, Number((input.file.file as { bytesRead?: number }).bytesRead ?? 0));

    if (ownerType === "USER" && input.userId) {
      try {
        await this.assertSignedInCanStore(input.userId, fileBytes);
      } catch (error) {
        await storage.delete(storagePath);
        throw error;
      }
    }

    if (ownerType === "GUEST" && input.guestSessionId) {
      try {
        await guestService.assertGuestCanUpload(input.guestSessionId, fileBytes);
      } catch (error) {
        await storage.delete(storagePath);
        throw error;
      }
    }

    let expiresAt: Date | undefined;
    if (ownerType === "GUEST" && input.guestSessionId) {
      expiresAt = (await guestService.registerGuestUpload(input.guestSessionId, fileBytes)).expiresAt;
    }

    if (ownerType === "USER" && input.userId) {
      expiresAt = await this.resolveSignedInExpiry(input.userId);
    }

    const created = await this.repository.create({
      ownerType,
      userId: input.userId,
      guestSessionId: input.guestSessionId,
      filename: input.file.filename,
      mimeType: String(mimeType),
      extension,
      sizeBytes: BigInt(fileBytes),
      storagePath,
      expiresAt
    });

    await this.repository.updateContent(created.id, {
      storagePath,
      sizeBytes: BigInt(fileBytes),
      mimeType: String(mimeType)
    });

    return created;
  }

  async replace(mediaId: string, file: MultipartFile) {
    const media = await this.repository.findById(mediaId);
    if (!media) {
      throw new HttpError(404, "Media not found");
    }

    const storagePath = `media/${mediaId}/v${Date.now()}-${file.filename}`;
    await storage.replace({ stream: file.file, path: storagePath });

    const fileBytes = Math.max(0, Number((file.file as { bytesRead?: number }).bytesRead ?? 0));
    const extension = extname(file.filename || "").replace(".", "").toLowerCase() || undefined;

    if (media.ownerType === "USER" && media.userId) {
      await this.assertSignedInCanStore(media.userId, fileBytes, media.id);
    }

    return this.repository.updateContent(mediaId, {
      storagePath,
      sizeBytes: BigInt(fileBytes),
      mimeType: file.mimetype || media.mimeType,
      filename: file.filename || media.filename,
      extension
    });
  }
}
