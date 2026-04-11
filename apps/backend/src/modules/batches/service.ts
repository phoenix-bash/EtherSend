import { randomUUID } from "node:crypto";
import type { MediaFile } from "@prisma/client";
import { HttpError } from "../../utils/http-error.js";
import { BatchRepository, type BatchShareWithBatch, type MediaBatchWithItems } from "./repository.js";

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

export type BatchActor =
  | { kind: "user"; userId: string; role: "ADMIN" | "USER" }
  | { kind: "guest"; guestSessionId: string; requestStartMs: number };

export class BatchService {
  constructor(private readonly repository: BatchRepository) {}

  async listBatches(actor: BatchActor): Promise<{
    items: Array<{
      id: string;
      name: string | null;
      createdAt: Date;
      fileCount: number;
      share: {
        token: string;
        allowDownload: boolean;
        expiresAt: Date;
        publicPath: string;
      } | null;
    }>;
  }> {
    const batches = actor.kind === "user"
      ? await this.repository.listByUser(actor.userId, actor.role)
      : await this.repository.listByGuest(actor.guestSessionId);

    return {
      items: batches.map((batch) => ({
        id: batch.id,
        name: batch.name,
        createdAt: batch.createdAt,
        fileCount: batch._count.items,
        share: batch.shareToken
          ? {
              token: batch.shareToken.token,
              allowDownload: batch.shareToken.allowDownload,
              expiresAt: batch.shareToken.expiresAt,
              publicPath: `/share/${batch.shareToken.token}`
            }
          : null
      }))
    };
  }

  private mediaOwnedByActor(media: MediaFile, actor: BatchActor): boolean {
    if (actor.kind === "user") {
      if (actor.role === "ADMIN") {
        return true;
      }

      return media.ownerType === "USER" && media.userId === actor.userId;
    }

    return Boolean(
      media.ownerType === "GUEST" &&
        media.guestSessionId === actor.guestSessionId &&
        media.expiresAt &&
        media.expiresAt.getTime() >= actor.requestStartMs
    );
  }

  private ensureBatchOwnedByActor(batch: MediaBatchWithItems, actor: BatchActor): void {
    if (actor.kind === "user") {
      if (actor.role === "ADMIN") {
        return;
      }

      if (batch.ownerType !== "USER" || batch.userId !== actor.userId) {
        throw new HttpError(403, "Batch access not allowed");
      }

      return;
    }

    if (batch.ownerType !== "GUEST" || batch.guestSessionId !== actor.guestSessionId) {
      throw new HttpError(403, "Batch access not allowed");
    }
  }

  private computeShareExpiryFromMedia(share: BatchShareWithBatch): Date {
    const now = Date.now();
    const fallback = new Date(now + SIX_MONTHS_MS);
    const expiries = share.batch.items
      .map((item) => item.mediaFile.expiresAt?.getTime() ?? fallback.getTime())
      .sort((a, b) => a - b);

    if (expiries.length === 0) {
      throw new HttpError(400, "Batch has no media files");
    }

    const expiresAt = new Date(expiries[0]);
    if (expiresAt.getTime() <= now) {
      throw new HttpError(410, "Batch share has expired");
    }

    return expiresAt;
  }

  async createBatch(actor: BatchActor, mediaIds: string[], name?: string): Promise<MediaBatchWithItems> {
    const uniqueMediaIds = Array.from(new Set(mediaIds));
    if (uniqueMediaIds.length === 0) {
      throw new HttpError(400, "At least one media file is required");
    }

    const mediaFiles = await this.repository.findMediaByIds(uniqueMediaIds);
    if (mediaFiles.length !== uniqueMediaIds.length) {
      throw new HttpError(404, "One or more media files were not found");
    }

    for (const media of mediaFiles) {
      if (!this.mediaOwnedByActor(media, actor)) {
        throw new HttpError(403, "One or more media files are not allowed for this actor");
      }
    }

    return this.repository.createBatch({
      ownerType: actor.kind === "user" ? "USER" : "GUEST",
      userId: actor.kind === "user" ? actor.userId : undefined,
      guestSessionId: actor.kind === "guest" ? actor.guestSessionId : undefined,
      name,
      mediaIds: uniqueMediaIds
    });
  }

  async createOrRefreshShare(batchId: string, actor: BatchActor, allowDownload?: boolean): Promise<{
    token: string;
    allowDownload: boolean;
    expiresAt: Date;
    publicPath: string;
  }> {
    const batch = await this.repository.findBatchById(batchId);
    if (!batch) {
      throw new HttpError(404, "Batch not found");
    }

    this.ensureBatchOwnedByActor(batch, actor);
    const pseudoShare: BatchShareWithBatch = {
      ...(batch.shareToken ?? {
        id: "",
        batchId: batch.id,
        token: "",
        allowDownload: false,
        expiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      batch: {
        id: batch.id,
        ownerType: batch.ownerType,
        userId: batch.userId,
        guestSessionId: batch.guestSessionId,
        name: batch.name,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        items: batch.items
      }
    };

    const expiresAt = this.computeShareExpiryFromMedia(pseudoShare);
    const resolvedAllowDownload = allowDownload ?? batch.shareToken?.allowDownload ?? false;

    if (!batch.shareToken) {
      const token = randomUUID().replace(/-/g, "");
      const created = await this.repository.createShareToken(batch.id, token, resolvedAllowDownload, expiresAt);
      return {
        token: created.token,
        allowDownload: created.allowDownload,
        expiresAt: created.expiresAt,
        publicPath: `/share/${created.token}`
      };
    }

    const updated = await this.repository.updateShareToken(batch.id, {
      allowDownload: resolvedAllowDownload,
      expiresAt
    });

    return {
      token: updated.token,
      allowDownload: updated.allowDownload,
      expiresAt: updated.expiresAt,
      publicPath: `/share/${updated.token}`
    };
  }

  async updateShareSettings(batchId: string, actor: BatchActor, allowDownload: boolean): Promise<{
    token: string;
    allowDownload: boolean;
    expiresAt: Date;
    publicPath: string;
  }> {
    const batch = await this.repository.findBatchById(batchId);
    if (!batch) {
      throw new HttpError(404, "Batch not found");
    }

    this.ensureBatchOwnedByActor(batch, actor);

    if (!batch.shareToken) {
      throw new HttpError(404, "Batch share is not created yet");
    }

    const updated = await this.repository.updateShareToken(batch.id, {
      allowDownload
    });

    return {
      token: updated.token,
      allowDownload: updated.allowDownload,
      expiresAt: updated.expiresAt,
      publicPath: `/share/${updated.token}`
    };
  }

  async getPublicShare(token: string): Promise<{
    token: string;
    allowDownload: boolean;
    expiresAt: Date;
    batch: {
      id: string;
      name: string | null;
      files: Array<{
        id: string;
        filename: string;
        mimeType: string;
        sizeBytes: string;
        viewPath: string;
        downloadPath: string;
      }>;
    };
  }> {
    const share = await this.repository.findShareByToken(token);
    if (!share) {
      throw new HttpError(404, "Share link not found");
    }

    if (share.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(410, "Share link has expired");
    }

    const files = share.batch.items
      .map((item) => item.mediaFile)
      .filter((media) => media.isActive && (!media.expiresAt || media.expiresAt.getTime() > Date.now()))
      .map((media) => ({
        id: media.id,
        filename: media.filename,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes.toString(),
        viewPath: `/shares/${token}/files/${media.id}`,
        downloadPath: `/shares/${token}/files/${media.id}?disposition=download`
      }));

    return {
      token: share.token,
      allowDownload: share.allowDownload,
      expiresAt: share.expiresAt,
      batch: {
        id: share.batch.id,
        name: share.batch.name,
        files
      }
    };
  }

  async resolveSharedMedia(token: string, mediaId: string, disposition: "view" | "download"): Promise<MediaFile> {
    const share = await this.repository.findShareByToken(token);
    if (!share) {
      throw new HttpError(404, "Share link not found");
    }

    if (share.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(410, "Share link has expired");
    }

    if (disposition === "download" && !share.allowDownload) {
      throw new HttpError(403, "Download is disabled for this share");
    }

    const media = share.batch.items.find((item) => item.mediaFileId === mediaId)?.mediaFile;
    if (!media) {
      throw new HttpError(404, "Media file not found in this share");
    }

    if (!media.isActive) {
      throw new HttpError(403, "Media link is disabled");
    }

    if (media.expiresAt && media.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(410, "Media link has expired");
    }

    return media;
  }
}
