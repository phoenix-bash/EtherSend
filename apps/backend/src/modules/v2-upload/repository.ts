import type { Prisma, V2Upload } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

interface CreateUploadInput {
  fileId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  s3Bucket: string;
  status: "PENDING" | "UPLOADING";
  uploadId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export class V2UploadRepository {
  async create(input: CreateUploadInput): Promise<V2Upload> {
    return prisma.v2Upload.create({
      data: {
        fileId: input.fileId,
        userId: input.userId,
        fileName: input.fileName,
        fileSize: BigInt(input.fileSize),
        mimeType: input.mimeType,
        s3Key: input.s3Key,
        s3Bucket: input.s3Bucket,
        status: input.status,
        uploadId: input.uploadId ?? null,
        metadata: input.metadata
      }
    });
  }

  async findByFileId(fileId: string): Promise<V2Upload | null> {
    return prisma.v2Upload.findUnique({ where: { fileId } });
  }

  async findByFileIdAndUser(fileId: string, userId: string): Promise<V2Upload | null> {
    return prisma.v2Upload.findFirst({
      where: {
        fileId,
        userId
      }
    });
  }

  async findByUploadAndKey(userId: string, uploadId: string, s3Key: string): Promise<V2Upload | null> {
    return prisma.v2Upload.findFirst({
      where: {
        userId,
        uploadId,
        s3Key
      }
    });
  }

  async markCompleted(fileId: string, parts: Prisma.InputJsonValue, fileUrl: string): Promise<V2Upload> {
    return prisma.v2Upload.update({
      where: { fileId },
      data: {
        status: "COMPLETED",
        etags: parts,
        fileUrl,
        completedAt: new Date(),
        metadata: {
          status: "completed"
        }
      }
    });
  }

  async markAborted(fileId: string): Promise<V2Upload> {
    return prisma.v2Upload.update({
      where: { fileId },
      data: {
        status: "ABORTED",
        metadata: {
          status: "aborted"
        }
      }
    });
  }

  async markFailed(fileId: string, error: string): Promise<V2Upload> {
    return prisma.v2Upload.update({
      where: { fileId },
      data: {
        status: "FAILED",
        metadata: {
          status: "failed",
          error
        }
      }
    });
  }
}
