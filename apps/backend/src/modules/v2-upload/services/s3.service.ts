import { randomUUID } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../../config/env.js";
import { sanitizeFileName, sanitizePathSegment } from "../validation.js";

interface MultipartCompleteInput {
  uploadId: string;
  key: string;
  parts: CompletedPart[];
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function encodeObjectKey(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export class V2S3Service {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;

  constructor() {
    const sharedClientConfig = {
      region: env.V2_S3_REGION,
      forcePathStyle: env.V2_S3_FORCE_PATH_STYLE,
      credentials:
        env.V2_S3_ACCESS_KEY_ID && env.V2_S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.V2_S3_ACCESS_KEY_ID,
              secretAccessKey: env.V2_S3_SECRET_ACCESS_KEY
            }
          : undefined
    };

    this.client = new S3Client({
      endpoint: env.V2_S3_ENDPOINT || undefined,
      ...sharedClientConfig
    });

    this.presignClient = new S3Client({
      endpoint: env.V2_S3_PUBLIC_ENDPOINT || env.V2_S3_ENDPOINT || undefined,
      ...sharedClientConfig
    });
  }

  buildObjectKey(userId: string, fileId: string, fileName: string): string {
    const normalizedUserId = sanitizePathSegment(userId) || randomUUID();
    const normalizedFileName = sanitizeFileName(fileName);
    return `uploads/${normalizedUserId}/${fileId}/${normalizedFileName}`;
  }

  async createDirectUploadUrl(key: string, mimeType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.V2_S3_BUCKET,
      Key: key,
      ContentType: mimeType
    });

    return getSignedUrl(this.presignClient, command, {
      expiresIn: env.V2_SIGNED_URL_TTL_SECONDS
    });
  }

  async createMultipartUpload(key: string, mimeType: string): Promise<string> {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: env.V2_S3_BUCKET,
        Key: key,
        ContentType: mimeType
      })
    );

    if (!result.UploadId) {
      throw new Error("Failed to create multipart upload ID.");
    }

    return result.UploadId;
  }

  async createMultipartPartUrls(uploadId: string, key: string, partCount: number): Promise<string[]> {
    const urls: string[] = [];

    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      urls.push(await this.createMultipartPartUrl(uploadId, key, partNumber));
    }

    return urls;
  }

  async createMultipartPartUrl(uploadId: string, key: string, partNumber: number): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: env.V2_S3_BUCKET,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber
    });

    return getSignedUrl(this.presignClient, command, {
      expiresIn: env.V2_SIGNED_URL_TTL_SECONDS
    });
  }

  async completeMultipartUpload(input: MultipartCompleteInput): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: env.V2_S3_BUCKET,
        Key: input.key,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: input.parts
        }
      })
    );
  }

  async abortMultipartUpload(uploadId: string, key: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: env.V2_S3_BUCKET,
        Key: key,
        UploadId: uploadId
      })
    );
  }

  buildObjectUrl(key: string): string {
    const encodedKey = encodeObjectKey(key);

    if (env.V2_S3_PUBLIC_ENDPOINT || env.V2_S3_ENDPOINT) {
      const endpoint = trimTrailingSlash(env.V2_S3_PUBLIC_ENDPOINT || env.V2_S3_ENDPOINT || "");
      return `${endpoint}/${env.V2_S3_BUCKET}/${encodedKey}`;
    }

    return `https://${env.V2_S3_BUCKET}.s3.${env.V2_S3_REGION}.amazonaws.com/${encodedKey}`;
  }
}
