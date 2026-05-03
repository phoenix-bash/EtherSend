import { randomUUID } from "node:crypto";
import type { MediaFile } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import type { EmailProvider } from "../../providers/email/email-provider.js";
import { buildThemeEmailHtml, buildThemeEmailText } from "../../providers/email/theme.js";
import { formatDateTimeDdMmYyyyHmAmPm } from "../../utils/date-time.js";
import { HttpError } from "../../utils/http-error.js";
import { BatchRepository, type BatchShareWithBatch, type MediaBatchWithItems } from "./repository.js";

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;
const SHARE_PASSWORD_SALT_ROUNDS = 10;

export type BatchActor =
  | { kind: "user"; userId: string; role: "ADMIN" | "USER" }
  | { kind: "guest"; guestSessionId: string; requestStartMs: number };

export interface CreateBatchShareExpiryInput {
  expiresAt?: Date;
  durationMinutes?: number;
}

export class BatchService {
  constructor(
    private readonly repository: BatchRepository,
    private readonly emailProvider: EmailProvider | null
  ) {}

  private requireEmailProvider(): EmailProvider {
    if (!this.emailProvider) {
      throw new HttpError(503, "Email delivery is not configured.");
    }

    return this.emailProvider;
  }

  private buildShareDeliveryEmailHtml(input: { shareUrl: string; expiresAt: Date; batchName?: string | null; timeZone?: string }): string {
    const resolvedBatchLabel = input.batchName?.trim() ? input.batchName.trim() : "Shared batch";
    const expiresAtLabel = formatDateTimeDdMmYyyyHmAmPm(input.expiresAt, input.timeZone);

    return buildThemeEmailHtml({
      eyebrow: "Secure Share",
      title: "A file link is ready",
      intro: "You received access to a secure shared batch.",
      actionLabel: "Open secure link",
      actionUrl: input.shareUrl,
      fields: [{ label: "Batch", value: resolvedBatchLabel }],
      fallbackLabel: "If the button does not work, open this URL:",
      fallbackValue: input.shareUrl,
      footer: `Expires: ${expiresAtLabel}`
    });
  }

  private buildShareDeliveryEmailText(input: { shareUrl: string; expiresAt: Date; batchName?: string | null; timeZone?: string }): string {
    const resolvedBatchLabel = input.batchName?.trim() ? input.batchName.trim() : "Shared batch";
    const expiresAtLabel = formatDateTimeDdMmYyyyHmAmPm(input.expiresAt, input.timeZone);
    return buildThemeEmailText({
      title: "A secure file link has been shared with you.",
      intro: "Use the secure link below to open your shared batch.",
      fields: [{ label: "Batch", value: resolvedBatchLabel }],
      actionLabel: "Open link",
      actionUrl: input.shareUrl,
      footer: `Expires at: ${expiresAtLabel}`
    });
  }

  private canInlinePreviewWhenDownloadDisabled(mimeType: string): boolean {
    if (mimeType.startsWith("image/")) {
      return true;
    }

    if (mimeType.startsWith("video/")) {
      return true;
    }

    if (mimeType.startsWith("text/")) {
      return true;
    }

    const normalized = mimeType.toLowerCase();
    return (
      normalized === "application/pdf" ||
      normalized === "application/json" ||
      normalized === "application/xml" ||
      normalized === "text/xml" ||
      normalized === "application/yaml" ||
      normalized === "application/x-yaml" ||
      normalized === "application/javascript" ||
      normalized === "application/x-javascript" ||
      normalized.includes("application/msword") ||
      normalized.includes("application/vnd.ms-") ||
      normalized.includes("application/vnd.openxmlformats-officedocument")
    );
  }

  async listBatches(actor: BatchActor): Promise<{
    items: Array<{
      id: string;
      name: string | null;
      createdAt: Date;
      fileCount: number;
      share: {
        token: string;
        allowDownload: boolean;
        hideFilenames: boolean;
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
              hideFilenames: (batch.shareToken as { hideFilenames?: boolean }).hideFilenames ?? false,
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

  private resolveShareExpiry(
    actor: BatchActor,
    maxAllowedExpiresAt: Date,
    requested?: CreateBatchShareExpiryInput
  ): Date {
    if (!requested || (requested.expiresAt === undefined && requested.durationMinutes === undefined)) {
      return maxAllowedExpiresAt;
    }

    if (actor.kind !== "user") {
      throw new HttpError(403, "Custom share expiry is available for signed-in users only");
    }

    if (requested.expiresAt !== undefined && requested.durationMinutes !== undefined) {
      throw new HttpError(400, "Provide either expiresAt or durationMinutes");
    }

    const now = Date.now();
    const resolved =
      requested.expiresAt !== undefined
        ? requested.expiresAt
        : new Date(now + Math.max(0, requested.durationMinutes ?? 0) * 60 * 1000);

    if (Number.isNaN(resolved.getTime()) || resolved.getTime() <= now) {
      throw new HttpError(400, "Share expiry must be in the future");
    }

    if (resolved.getTime() > maxAllowedExpiresAt.getTime()) {
      throw new HttpError(400, "Share expiry exceeds media validity window");
    }

    return resolved;
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

  async deleteBatch(batchId: string, actor: BatchActor): Promise<void> {
    const batch = await this.repository.findBatchById(batchId);
    if (!batch) {
      throw new HttpError(404, "Batch not found");
    }

    this.ensureBatchOwnedByActor(batch, actor);
    await this.repository.deleteBatch(batch.id);
  }

  async createOrRefreshShare(
    batchId: string,
    actor: BatchActor,
    allowDownload?: boolean,
    hideFilenames?: boolean,
    password?: string,
    previewViewLimit?: number,
    requestedExpiry?: CreateBatchShareExpiryInput
  ): Promise<{
    token: string;
    allowDownload: boolean;
    hideFilenames: boolean;
    hasPassword: boolean;
    previewViewLimit: number | null;
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
        hideFilenames: false,
        passwordHash: null,
        previewViewLimit: null,
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
        user: batch.user,
        items: batch.items
      }
    };

    const maxAllowedExpiresAt = this.computeShareExpiryFromMedia(pseudoShare);
    const expiresAt = this.resolveShareExpiry(actor, maxAllowedExpiresAt, requestedExpiry);
    const resolvedAllowDownload = allowDownload ?? batch.shareToken?.allowDownload ?? false;
    const resolvedHideFilenames = hideFilenames ?? (batch.shareToken as { hideFilenames?: boolean } | null)?.hideFilenames ?? false;
    const existingPreviewViewLimit = (batch.shareToken as { previewViewLimit?: number | null } | null)?.previewViewLimit ?? null;
    const resolvedPreviewViewLimit = resolvedAllowDownload ? null : Math.max(1, Math.min(5, previewViewLimit ?? existingPreviewViewLimit ?? 3));
    if (password !== undefined && actor.kind !== "user") {
      throw new HttpError(403, "Share password is available for signed-in users only");
    }
    const resolvedPasswordHash =
      password !== undefined
        ? (password.length > 0 ? await hash(password, SHARE_PASSWORD_SALT_ROUNDS) : null)
        : ((batch.shareToken as { passwordHash?: string | null } | null)?.passwordHash ?? null);

    if (!batch.shareToken) {
      const token = randomUUID().replace(/-/g, "");
      const created = await this.repository.createShareToken(
        batch.id,
        token,
        resolvedAllowDownload,
        resolvedHideFilenames,
        resolvedPasswordHash,
        resolvedPreviewViewLimit,
        expiresAt
      );
      return {
        token: created.token,
        allowDownload: created.allowDownload,
        hideFilenames: (created as { hideFilenames?: boolean }).hideFilenames ?? false,
        hasPassword: Boolean((created as { passwordHash?: string | null }).passwordHash),
        previewViewLimit: (created as { previewViewLimit?: number | null }).previewViewLimit ?? null,
        expiresAt: created.expiresAt,
        publicPath: `/share/${created.token}`
      };
    }

    const updated = await this.repository.updateShareToken(batch.id, {
      allowDownload: resolvedAllowDownload,
      hideFilenames: resolvedHideFilenames,
      passwordHash: resolvedPasswordHash,
      previewViewLimit: resolvedPreviewViewLimit,
      expiresAt
    });

    return {
      token: updated.token,
      allowDownload: updated.allowDownload,
      hideFilenames: (updated as { hideFilenames?: boolean }).hideFilenames ?? false,
      hasPassword: Boolean((updated as { passwordHash?: string | null }).passwordHash),
      previewViewLimit: (updated as { previewViewLimit?: number | null }).previewViewLimit ?? null,
      expiresAt: updated.expiresAt,
      publicPath: `/share/${updated.token}`
    };
  }

  async sendShareEmail(
    batchId: string,
    actor: BatchActor,
    recipientEmail: string,
    frontendBaseUrl: string,
    timeZone?: string
  ): Promise<{ expiresAt: Date; hasPassword: boolean }> {
    if (actor.kind !== "user") {
      throw new HttpError(403, "Share email delivery is available for signed-in users only");
    }

    const batch = await this.repository.findBatchById(batchId);
    if (!batch) {
      throw new HttpError(404, "Batch not found");
    }

    this.ensureBatchOwnedByActor(batch, actor);

    if (!batch.shareToken) {
      throw new HttpError(404, "Batch share is not created yet");
    }

    const shareUrl = `${frontendBaseUrl.replace(/\/+$/, "")}/share/${batch.shareToken.token}`;

    const emailProvider = this.requireEmailProvider();
    await emailProvider.sendEmail({
      to: recipientEmail,
      subject: "Secure file link",
      html: this.buildShareDeliveryEmailHtml({
        shareUrl,
        expiresAt: batch.shareToken.expiresAt,
        batchName: batch.name,
        timeZone
      }),
      text: this.buildShareDeliveryEmailText({
        shareUrl,
        expiresAt: batch.shareToken.expiresAt,
        batchName: batch.name,
        timeZone
      })
    });

    return {
      expiresAt: batch.shareToken.expiresAt,
      hasPassword: Boolean((batch.shareToken as { passwordHash?: string | null }).passwordHash)
    };
  }

  async updateShareSettings(
    batchId: string,
    actor: BatchActor,
    allowDownload: boolean,
    hideFilenames?: boolean,
    password?: string,
    previewViewLimit?: number
  ): Promise<{
    token: string;
    allowDownload: boolean;
    hideFilenames: boolean;
    hasPassword: boolean;
    previewViewLimit: number | null;
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

    if (password !== undefined && actor.kind !== "user") {
      throw new HttpError(403, "Share password is available for signed-in users only");
    }

    const resolvedPasswordHash =
      password !== undefined
        ? (password.length > 0 ? await hash(password, SHARE_PASSWORD_SALT_ROUNDS) : null)
        : undefined;

    const existingPreviewViewLimit = (batch.shareToken as { previewViewLimit?: number | null }).previewViewLimit ?? null;
    const resolvedPreviewViewLimit = allowDownload ? null : Math.max(1, Math.min(5, previewViewLimit ?? existingPreviewViewLimit ?? 3));

    const updated = await this.repository.updateShareToken(batch.id, {
      allowDownload,
      hideFilenames,
      passwordHash: resolvedPasswordHash,
      previewViewLimit: resolvedPreviewViewLimit
    });

    return {
      token: updated.token,
      allowDownload: updated.allowDownload,
      hideFilenames: (updated as { hideFilenames?: boolean }).hideFilenames ?? false,
      hasPassword: Boolean((updated as { passwordHash?: string | null }).passwordHash),
      previewViewLimit: (updated as { previewViewLimit?: number | null }).previewViewLimit ?? null,
      expiresAt: updated.expiresAt,
      publicPath: `/share/${updated.token}`
    };
  }

  async getPublicShare(token: string, providedPassword?: string): Promise<{
    token: string;
    allowDownload: boolean;
    hideFilenames: boolean;
    hasPassword: boolean;
    previewViewLimit: number | null;
    expiresAt: Date;
    sharedBy: string;
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

    const configuredPasswordHash = (share as { passwordHash?: string | null }).passwordHash ?? null;
    if (configuredPasswordHash) {
      if (!providedPassword) {
        throw new HttpError(401, "Share password is required", {
          code: "SHARE_PASSWORD_REQUIRED"
        });
      }

      const passwordMatches = await compare(providedPassword, configuredPasswordHash);
      if (!passwordMatches) {
        throw new HttpError(401, "Invalid share password", {
          code: "SHARE_PASSWORD_INVALID"
        });
      }
    }

    const files = share.batch.items
      .map((item) => item.mediaFile)
      .filter((media) => media.isActive && (!media.expiresAt || media.expiresAt.getTime() > Date.now()))
      .map((media) => ({
        id: media.id,
        filename: (share as { hideFilenames?: boolean }).hideFilenames ? "Filename hidden" : media.filename,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes.toString(),
        viewPath: `/shares/${token}/files/${media.id}`,
        downloadPath: `/shares/${token}/files/${media.id}?disposition=download`
      }));

    const sharerFullName = share.batch.user?.name?.trim();
    const sharerEmail = share.batch.user?.email?.trim();
    const sharerFromEmail = sharerEmail ? sharerEmail.split("@")[0]?.trim() : "";
    const sharedBy = sharerFullName || sharerFromEmail || "Guest user";

    return {
      token: share.token,
      allowDownload: share.allowDownload,
      hideFilenames: (share as { hideFilenames?: boolean }).hideFilenames ?? false,
      hasPassword: Boolean(configuredPasswordHash),
      previewViewLimit: (share as { previewViewLimit?: number | null }).previewViewLimit ?? null,
      expiresAt: share.expiresAt,
      sharedBy,
      batch: {
        id: share.batch.id,
        name: share.batch.name,
        files
      }
    };
  }

  async resolveSharedMedia(
    token: string,
    mediaId: string,
    disposition: "view" | "download",
    providedPassword?: string,
    options?: {
      trackPreviewView?: boolean;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<{ media: MediaFile; hideFilenames: boolean }> {
    const share = await this.repository.findShareByToken(token);
    if (!share) {
      throw new HttpError(404, "Share link not found");
    }

    if (share.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(410, "Share link has expired");
    }

    const configuredPasswordHash = (share as { passwordHash?: string | null }).passwordHash ?? null;
    if (configuredPasswordHash) {
      if (!providedPassword) {
        throw new HttpError(401, "Share password is required", {
          code: "SHARE_PASSWORD_REQUIRED"
        });
      }

      const passwordMatches = await compare(providedPassword, configuredPasswordHash);
      if (!passwordMatches) {
        throw new HttpError(401, "Invalid share password", {
          code: "SHARE_PASSWORD_INVALID"
        });
      }
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

    if (disposition === "view" && !share.allowDownload && !this.canInlinePreviewWhenDownloadDisabled(media.mimeType)) {
      throw new HttpError(403, "Preview is unavailable for this file type when downloads are disabled");
    }

    if (disposition === "view" && !share.allowDownload && options?.trackPreviewView) {
      const configuredLimit = (share as { previewViewLimit?: number | null }).previewViewLimit ?? null;
      if (configuredLimit !== null && configuredLimit !== undefined) {
        const currentCount = await this.repository.countPreviewViewsForShareFile(token, media.id);
        if (currentCount >= configuredLimit) {
          throw new HttpError(403, "Preview view limit reached for this share", {
            code: "SHARE_PREVIEW_LIMIT_REACHED"
          });
        }

        await this.repository.createPreviewViewLog(token, media.id, options.ipAddress, options.userAgent);
      }
    }

    return {
      media,
      hideFilenames: (share as { hideFilenames?: boolean }).hideFilenames ?? false
    };
  }
}
