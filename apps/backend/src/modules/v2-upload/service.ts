import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { CompletedPart } from "@aws-sdk/client-s3";
import type { MediaFile, OwnerType } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { enqueueDocumentConversion } from "../../queues/document-conversion-queue.js";
import { HttpError } from "../../utils/http-error.js";
import { GuestService } from "../guest/service.js";
import { MediaRepository } from "../media/repository.js";
import type {
  UploadAbortRequest,
  UploadActor,
  UploadChunkRequest,
  UploadChunkResponse,
  UploadCompleteRequest,
  UploadCompleteResponse,
  UploadInitRequest,
  UploadInitResponse
} from "./types.js";
import { DIRECT_UPLOAD_THRESHOLD_BYTES, S3_MULTIPART_MAX_PARTS } from "./types.js";
import { V2UploadRepository } from "./repository.js";
import { V2S3Service } from "./services/s3.service.js";
import { isMimeTypeAllowed, resolveAllowedMimePatterns } from "./validation.js";

export class V2UploadService {
  private readonly allowedMimePatterns = resolveAllowedMimePatterns(env.V2_ALLOWED_MIME_TYPES);

  constructor(
    private readonly repository: V2UploadRepository,
    private readonly s3Service: V2S3Service,
    private readonly guestService: GuestService,
    private readonly mediaRepository: MediaRepository
  ) {}

  private resolveMaxFileSize(actor: UploadActor): number {
    const actorTotalLimit = actor.isGuest ? env.MAX_UPLOAD_BYTES : env.SIGNED_IN_MAX_TOTAL_BYTES;
    const actorPerFileLimit = actor.isGuest ? env.V2_MAX_FILE_SIZE_GUEST_BYTES : env.V2_MAX_FILE_SIZE_SIGNED_BYTES;

    return Math.min(actorTotalLimit, actorPerFileLimit);
  }

  private resolveStoredUserId(actor: UploadActor): string {
    if (!actor.isGuest) {
      return actor.userId;
    }

    return `guest:${actor.guestSessionId ?? actor.userId}`;
  }

  private async assertSignedInCanStore(userId: string, fileBytes: number): Promise<void> {
    const [legacyUsage, v2Usage] = await Promise.all([
      prisma.mediaFile.aggregate({
        where: {
          ownerType: "USER",
          userId
        },
        _sum: {
          sizeBytes: true
        }
      }),
      prisma.v2Upload.aggregate({
        where: {
          userId,
          status: {
            in: ["PENDING", "UPLOADING", "COMPLETED"]
          }
        },
        _sum: {
          fileSize: true
        }
      })
    ]);

    const currentBytes = (legacyUsage._sum.sizeBytes ?? 0n) + (v2Usage._sum.fileSize ?? 0n);
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

    const threeMonthsMs = 1000 * 60 * 60 * 24 * 30 * 3;
    return new Date(Date.now() + threeMonthsMs);
  }

  private serializeMedia(media: MediaFile): UploadCompleteResponse["media"] {
    return {
      id: media.id,
      filename: media.filename,
      mimeType: media.mimeType,
      extension: media.extension ?? null,
      sizeBytes: media.sizeBytes.toString(),
      isActive: media.isActive,
      allowDownload: media.allowDownload,
      expiresAt: media.expiresAt?.toISOString() ?? null,
      updatedAt: media.updatedAt.toISOString()
    };
  }

  private async ensureMediaRecordForCompletedUpload(
    upload: {
      fileId: string;
      fileName: string;
      fileSize: bigint;
      mimeType: string | null;
      s3Bucket: string;
      s3Key: string;
    },
    actor: UploadActor
  ): Promise<MediaFile> {
    const existing = await this.mediaRepository.findById(upload.fileId);
    if (existing) {
      return existing;
    }

    const ownerType: OwnerType = actor.isGuest ? "GUEST" : "USER";
    const extension = extname(upload.fileName || "")
      .replace(".", "")
      .toLowerCase() || undefined;

    let expiresAt: Date | undefined;
    if (actor.isGuest) {
      const guestSessionId = actor.guestSessionId ?? "";
      const guest = await this.guestService.registerGuestUpload(guestSessionId, Number(upload.fileSize));
      expiresAt = guest.expiresAt;
    } else {
      expiresAt = await this.resolveSignedInExpiry(actor.userId);
    }

    return this.mediaRepository.create({
      id: upload.fileId,
      ownerType,
      userId: actor.isGuest ? undefined : actor.userId,
      guestSessionId: actor.isGuest ? actor.guestSessionId : undefined,
      filename: upload.fileName,
      mimeType: upload.mimeType || "application/octet-stream",
      extension,
      sizeBytes: upload.fileSize,
      storagePath: `s3://${upload.s3Bucket}/${upload.s3Key}`,
      expiresAt
    });
  }

  async initUpload(payload: UploadInitRequest, actor: UploadActor): Promise<UploadInitResponse> {
    const maxFileSize = this.resolveMaxFileSize(actor);

    if (payload.fileSize > maxFileSize) {
      throw new HttpError(413, `File exceeds max allowed size (${maxFileSize} bytes).`);
    }

    if (!isMimeTypeAllowed(payload.mimeType, this.allowedMimePatterns)) {
      throw new HttpError(400, `MIME type not allowed: ${payload.mimeType}`);
    }

    if (actor.isGuest) {
      await this.guestService.assertGuestCanUpload(actor.guestSessionId ?? "", payload.fileSize);
    } else {
      await this.assertSignedInCanStore(actor.userId, payload.fileSize);
    }

    const fileId = randomUUID();
    const storedUserId = this.resolveStoredUserId(actor);
    const key = this.s3Service.buildObjectKey(storedUserId, fileId, payload.fileName);

    if (payload.fileSize < DIRECT_UPLOAD_THRESHOLD_BYTES) {
      const signedUrl = await this.s3Service.createDirectUploadUrl(key, payload.mimeType);

      await this.repository.create({
        fileId,
        userId: storedUserId,
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        mimeType: payload.mimeType,
        s3Bucket: env.V2_S3_BUCKET,
        s3Key: key,
        status: "UPLOADING",
        metadata: {
          useMultipart: false
        }
      });

      return {
        fileId,
        uploadId: null,
        useMultipart: false,
        signedUrl,
        key
      };
    }

    const partCount = Math.ceil(payload.fileSize / env.V2_CHUNK_SIZE_BYTES);
    if (partCount > S3_MULTIPART_MAX_PARTS) {
      throw new HttpError(400, `File produces too many parts (${partCount}); reduce file size.`);
    }

    const uploadId = await this.s3Service.createMultipartUpload(key, payload.mimeType);
    const signedUrls = await this.s3Service.createMultipartPartUrls(uploadId, key, partCount);

    await this.repository.create({
      fileId,
      userId: storedUserId,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      mimeType: payload.mimeType,
      s3Bucket: env.V2_S3_BUCKET,
      s3Key: key,
      status: "UPLOADING",
      uploadId,
      metadata: {
        useMultipart: true,
        chunkSize: env.V2_CHUNK_SIZE_BYTES,
        partCount
      }
    });

    return {
      fileId,
      uploadId,
      useMultipart: true,
      chunkSize: env.V2_CHUNK_SIZE_BYTES,
      signedUrls,
      key
    };
  }

  async completeUpload(payload: UploadCompleteRequest, actor: UploadActor): Promise<UploadCompleteResponse> {
    const storedUserId = this.resolveStoredUserId(actor);
    const upload = await this.repository.findByFileIdAndUser(payload.fileId, storedUserId);

    if (!upload) {
      throw new HttpError(404, "Upload not found");
    }

    if (upload.s3Key !== payload.key) {
      throw new HttpError(400, "Upload key mismatch");
    }

    if (upload.status === "COMPLETED") {
      const media = (await this.mediaRepository.findById(upload.fileId)) ?? (await this.ensureMediaRecordForCompletedUpload(upload, actor));
      if (media) {
        void enqueueDocumentConversion(media.id, "upload").catch(() => {
          // Keep completion path non-blocking.
        });
      }
      return {
        success: true,
        fileId: upload.fileId,
        fileUrl: upload.fileUrl ?? this.s3Service.buildObjectUrl(upload.s3Key),
        media: media ? this.serializeMedia(media) : undefined,
        metadata: {
          status: "completed",
          completedAt: upload.completedAt?.toISOString() ?? new Date().toISOString(),
          useMultipart: Boolean(upload.uploadId),
          sizeBytes: upload.fileSize.toString(),
          mimeType: upload.mimeType
        }
      };
    }

    if (upload.uploadId) {
      if (!payload.uploadId || payload.uploadId !== upload.uploadId) {
        throw new HttpError(400, "Multipart upload ID mismatch");
      }

      const parts = (payload.parts ?? []).slice().sort((a, b) => a.PartNumber - b.PartNumber);
      if (parts.length === 0) {
        throw new HttpError(400, "Multipart completion requires uploaded parts");
      }

      const completedParts: CompletedPart[] = parts.map((part) => ({
        ETag: part.ETag,
        PartNumber: part.PartNumber
      }));

      await this.s3Service.completeMultipartUpload({
        uploadId: upload.uploadId,
        key: upload.s3Key,
        parts: completedParts
      });
    }

    const fileUrl = this.s3Service.buildObjectUrl(upload.s3Key);
    const completed = await this.repository.markCompleted(upload.fileId, payload.parts ?? [], fileUrl);
    const media = await this.ensureMediaRecordForCompletedUpload(completed, actor);
    void enqueueDocumentConversion(media.id, "upload").catch(() => {
      // Keep completion path non-blocking.
    });

    return {
      success: true,
      fileId: completed.fileId,
      fileUrl,
      media: this.serializeMedia(media),
      metadata: {
        status: "completed",
        completedAt: completed.completedAt?.toISOString() ?? new Date().toISOString(),
        useMultipart: Boolean(completed.uploadId),
        sizeBytes: completed.fileSize.toString(),
        mimeType: completed.mimeType
      }
    };
  }

  async abortUpload(payload: UploadAbortRequest, actor: UploadActor): Promise<{ success: true }> {
    const storedUserId = this.resolveStoredUserId(actor);
    const upload = await this.repository.findByUploadAndKey(storedUserId, payload.uploadId, payload.key);

    if (!upload) {
      throw new HttpError(404, "Upload not found");
    }

    if (upload.status !== "COMPLETED") {
      await this.s3Service.abortMultipartUpload(payload.uploadId, payload.key);
      await this.repository.markAborted(upload.fileId);
    }

    return { success: true };
  }

  async createChunkUrl(payload: UploadChunkRequest, actor: UploadActor): Promise<UploadChunkResponse> {
    const storedUserId = this.resolveStoredUserId(actor);
    const upload = await this.repository.findByUploadAndKey(storedUserId, payload.uploadId, payload.key);

    if (!upload) {
      throw new HttpError(404, "Upload not found");
    }

    if (!upload.uploadId || upload.uploadId !== payload.uploadId) {
      throw new HttpError(400, "Upload ID mismatch");
    }

    if (upload.status !== "UPLOADING") {
      throw new HttpError(409, "Upload is not active");
    }

    const url = await this.s3Service.createMultipartPartUrl(payload.uploadId, payload.key, payload.partNumber);

    return {
      url,
      partNumber: payload.partNumber
    };
  }
}
