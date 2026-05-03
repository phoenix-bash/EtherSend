import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env.js";
import type { StorageProvider, UploadInput } from "./storage-provider.js";

export class LocalStorageProvider implements StorageProvider {
  private readonly s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      region: env.V2_S3_REGION,
      endpoint: env.V2_S3_ENDPOINT || undefined,
      forcePathStyle: env.V2_S3_FORCE_PATH_STYLE,
      credentials:
        env.V2_S3_ACCESS_KEY_ID && env.V2_S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.V2_S3_ACCESS_KEY_ID,
              secretAccessKey: env.V2_S3_SECRET_ACCESS_KEY
            }
          : undefined
    });
  }

  private resolveS3Path(path: string): { bucket: string; key: string } {
    const match = path.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Non-S3 storage path is not supported: ${path}`);
    }

    const bucket = match[1];
    const key = match[2];
    if (!bucket || !key) {
      throw new Error(`Invalid S3 storage path: ${path}`);
    }

    return { bucket, key };
  }

  private async readStreamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(String(chunk)));
      }
    }

    return Buffer.concat(chunks);
  }

  async upload(input: UploadInput): Promise<{ path: string }> {
    const s3Path = this.resolveS3Path(input.path);
    const body = await this.readStreamToBuffer(input.stream);
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: s3Path.bucket,
        Key: s3Path.key,
        Body: body,
        ContentLength: body.byteLength
      })
    );

    return { path: input.path };
  }

  async replace(input: UploadInput): Promise<void> {
    const s3Path = this.resolveS3Path(input.path);
    const body = await this.readStreamToBuffer(input.stream);
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: s3Path.bucket,
        Key: s3Path.key,
        Body: body,
        ContentLength: body.byteLength
      })
    );
  }

  async delete(path: string): Promise<void> {
    const s3Path = this.resolveS3Path(path);
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: s3Path.bucket,
        Key: s3Path.key
      })
    );
  }

  async get(path: string): Promise<Readable> {
    const s3Path = this.resolveS3Path(path);
    const object = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: s3Path.bucket,
        Key: s3Path.key
      })
    );

    const body = object.Body;
    if (!body) {
      throw new Error(`S3 object has no body: ${path}`);
    }

    if (typeof (body as { pipe?: unknown }).pipe === "function") {
      return body as Readable;
    }

    if (body instanceof Uint8Array || typeof body === "string") {
      return Readable.from([body]);
    }

    if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
      const byteArray = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
      return Readable.from([byteArray]);
    }

    throw new Error(`Unsupported S3 stream body for path: ${path}`);
  }
}
