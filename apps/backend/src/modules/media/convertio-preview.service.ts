import { Readable } from "node:stream";
import { extname } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import JSZip from "jszip";
import type { MediaFile } from "@prisma/client";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";

const storage = new LocalStorageProvider();
const CONVERTIO_BASE_URL = "https://api.convertio.co/convert";
const CONVERTIO_STATUS_STEP_FINISH = "finish";
const IMAGE_FILE_NAME_PATTERN = /\.(png|jpe?g|webp|gif)$/i;

type ConvertioStartResponse = {
  code: number;
  status: "ok" | "error";
  data?: {
    id?: string;
    minutes?: number | string;
  };
  error?: string;
};

type ConvertioStatusResponse = {
  code: number;
  status: "ok" | "error";
  data?: {
    step?: string;
    percent?: number;
    output?: unknown;
  };
  error?: string;
};

type PreviewManifest = {
  status: "pending" | "processing" | "completed" | "failed";
  pages: string[];
  updatedAt: string;
  error?: string;
};

function isOfficeDocument(media: Pick<MediaFile, "mimeType" | "filename" | "extension">): boolean {
  const mime = media.mimeType.toLowerCase();
  if (
    mime.includes("application/msword") ||
    mime.includes("application/vnd.ms-") ||
    mime.includes("application/vnd.openxmlformats-officedocument") ||
    mime.includes("application/vnd.oasis.opendocument")
  ) {
    return true;
  }

  if (mime === "text/plain" || mime === "text/html") {
    return true;
  }

  const extension = (media.extension || extname(media.filename).replace(".", "")).toLowerCase();
  if (!extension || extension === "pdf") {
    return false;
  }

  return ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pps", "ppsx", "odt", "ods", "odp", "txt", "html", "htm"].includes(extension);
}

function parseS3Path(path: string): { bucket: string; key: string } {
  const match = path.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new HttpError(500, "Invalid media storage path", { code: "INVALID_STORAGE_PATH" });
  }

  return {
    bucket: match[1],
    key: match[2]
  };
}

function previewBasePath(media: Pick<MediaFile, "id" | "updatedAt">): string {
  return `s3://${env.V2_S3_BUCKET}/previews/office/${media.id}/${String(media.updatedAt.getTime())}`;
}

function manifestPath(media: Pick<MediaFile, "id" | "updatedAt">): string {
  return `${previewBasePath(media)}/manifest.json`;
}

function pageStoragePath(media: Pick<MediaFile, "id" | "updatedAt">, index: number): string {
  const extension = env.CONVERTIO_OUTPUT_FORMAT === "jpeg" ? "jpg" : env.CONVERTIO_OUTPUT_FORMAT;
  return `${previewBasePath(media)}/page-${String(index + 1).padStart(3, "0")}.${extension}`;
}

function pageFileName(path: string): string {
  const key = parseS3Path(path).key;
  return key.slice(key.lastIndexOf("/") + 1);
}

function normalizeOutputUrls(output: unknown): string[] {
  if (!output) {
    return [];
  }

  if (typeof output === "string") {
    return [output];
  }

  if (Array.isArray(output)) {
    return output.flatMap((entry) => normalizeOutputUrls(entry));
  }

  if (typeof output === "object") {
    const object = output as Record<string, unknown>;
    const nestedCandidates: unknown[] = [];

    if (typeof object.url === "string") {
      nestedCandidates.push(object.url);
    }

    if (Array.isArray(object.urls)) {
      nestedCandidates.push(...object.urls);
    }

    if (Array.isArray(object.files)) {
      nestedCandidates.push(...object.files);
    }

    if (object.output) {
      nestedCandidates.push(object.output);
    }

    if (object.result) {
      nestedCandidates.push(object.result);
    }

    return nestedCandidates.flatMap((entry) => normalizeOutputUrls(entry));
  }

  return [];
}

function isZipUrl(url: string): boolean {
  return /\.zip($|\?)/i.test(url);
}

function isImageUrl(url: string): boolean {
  return IMAGE_FILE_NAME_PATTERN.test(url);
}

export class ConvertioPreviewService {
  private readonly s3Client = new S3Client({
    region: env.V2_S3_REGION,
    endpoint: env.V2_S3_PUBLIC_ENDPOINT || env.V2_S3_ENDPOINT || undefined,
    forcePathStyle: env.V2_S3_FORCE_PATH_STYLE,
    credentials:
      env.V2_S3_ACCESS_KEY_ID && env.V2_S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.V2_S3_ACCESS_KEY_ID,
            secretAccessKey: env.V2_S3_SECRET_ACCESS_KEY
          }
        : undefined
  });

  private apiKeyCursor = 0;

  private allApiKeysInRotationOrder(): string[] {
    const keys = env.CONVERTIO_API_KEYS;
    if (!keys.length) {
      return [];
    }

    const start = this.apiKeyCursor % keys.length;
    const ordered: string[] = [];
    for (let index = 0; index < keys.length; index += 1) {
      ordered.push(keys[(start + index) % keys.length]);
    }

    this.apiKeyCursor = (start + 1) % keys.length;
    return ordered;
  }

  private async generateSignedSourceUrl(path: string): Promise<string> {
    const { bucket, key } = parseS3Path(path);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: 900
    });
  }

  private async readManifest(media: Pick<MediaFile, "id" | "updatedAt">): Promise<PreviewManifest | null> {
    try {
      const manifestStream = await storage.get(manifestPath(media));
      const chunks: Buffer[] = [];
      for await (const chunk of manifestStream) {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
          continue;
        }

        chunks.push(Buffer.from(chunk as Uint8Array));
      }

      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as PreviewManifest;
      if (!Array.isArray(parsed.pages) || typeof parsed.status !== "string") {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private async writeManifest(media: Pick<MediaFile, "id" | "updatedAt">, manifest: PreviewManifest): Promise<void> {
    const body = Buffer.from(JSON.stringify(manifest), "utf8");
    await storage.upload({
      path: manifestPath(media),
      stream: Readable.from([body])
    });
  }

  private async fetchConvertioStart(conversionUrl: string, apiKey: string): Promise<string> {
    const response = await fetch(CONVERTIO_BASE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        apikey: apiKey,
        input: "url",
        file: conversionUrl,
        outputformat: env.CONVERTIO_OUTPUT_FORMAT
      })
    });

    const payload = (await response.json()) as ConvertioStartResponse;
    if (!response.ok || payload.status !== "ok" || !payload.data?.id) {
      throw new HttpError(502, payload.error || "Failed to start Convertio conversion", {
        code: "CONVERTIO_START_FAILED"
      });
    }

    return payload.data.id;
  }

  private async startConversionWithRotation(conversionUrl: string): Promise<string> {
    const keys = this.allApiKeysInRotationOrder();
    if (!keys.length) {
      throw new HttpError(500, "Convertio API keys are not configured", {
        code: "CONVERTIO_API_KEYS_MISSING"
      });
    }

    let lastError: unknown = null;
    for (const key of keys) {
      try {
        return await this.fetchConvertioStart(conversionUrl, key);
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof HttpError) {
      throw lastError;
    }

    throw new HttpError(502, "Failed to start Convertio conversion", {
      code: "CONVERTIO_START_FAILED"
    });
  }

  private async pollConvertio(conversionId: string): Promise<string[]> {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= env.CONVERTIO_TIMEOUT_MS) {
      const response = await fetch(`${CONVERTIO_BASE_URL}/${conversionId}/status`);
      const payload = (await response.json()) as ConvertioStatusResponse;
      if (!response.ok || payload.status !== "ok") {
        throw new HttpError(502, payload.error || "Failed to get Convertio status", {
          code: "CONVERTIO_STATUS_FAILED"
        });
      }

      const step = String(payload.data?.step || "").toLowerCase();
      if (step === CONVERTIO_STATUS_STEP_FINISH) {
        const outputUrls = normalizeOutputUrls(payload.data?.output).filter((url) => /^https?:\/\//i.test(url));
        if (outputUrls.length === 0) {
          throw new HttpError(502, "Convertio output URLs were not returned", {
            code: "CONVERTIO_OUTPUT_MISSING"
          });
        }

        return outputUrls;
      }

      await wait(env.CONVERTIO_POLL_INTERVAL_MS);
    }

    throw new HttpError(504, "Convertio conversion timed out", {
      code: "CONVERTIO_TIMEOUT"
    });
  }

  private async downloadImageBuffersFromZip(zipUrl: string): Promise<Buffer[]> {
    const response = await fetch(zipUrl);
    if (!response.ok) {
      throw new HttpError(502, "Failed to download Convertio ZIP output", {
        code: "CONVERTIO_ZIP_DOWNLOAD_FAILED"
      });
    }

    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuffer);
    const imageEntries = Object.values(zip.files).filter((entry) => !entry.dir && IMAGE_FILE_NAME_PATTERN.test(entry.name));
    if (!imageEntries.length) {
      throw new HttpError(502, "Convertio ZIP did not contain image pages", {
        code: "CONVERTIO_ZIP_EMPTY"
      });
    }

    const buffers = await Promise.all(imageEntries.map((entry) => entry.async("nodebuffer")));
    return buffers;
  }

  private async downloadImageBuffers(urls: string[]): Promise<Buffer[]> {
    const zipUrl = urls.find((url) => isZipUrl(url));
    if (zipUrl) {
      return this.downloadImageBuffersFromZip(zipUrl);
    }

    const imageUrls = urls.filter((url) => isImageUrl(url));
    const targets = imageUrls.length > 0 ? imageUrls : urls;

    const buffers: Buffer[] = [];
    for (const url of targets) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new HttpError(502, "Failed to download Convertio output image", {
          code: "CONVERTIO_IMAGE_DOWNLOAD_FAILED"
        });
      }

      buffers.push(Buffer.from(await response.arrayBuffer()));
    }

    return buffers;
  }

  private async uploadPages(media: Pick<MediaFile, "id" | "updatedAt">, buffers: Buffer[]): Promise<string[]> {
    const output: string[] = [];
    for (let index = 0; index < buffers.length; index += 1) {
      const path = pageStoragePath(media, index);
      const body = buffers[index];
      await storage.upload({
        path,
        stream: Readable.from([body])
      });
      output.push(path);
    }

    return output;
  }

  async ensureOfficePagePreview(
    media: Pick<MediaFile, "id" | "updatedAt" | "storagePath" | "filename" | "mimeType" | "extension">
  ): Promise<string[]> {
    if (!isOfficeDocument(media)) {
      throw new HttpError(400, "Office image preview is not supported for this file type");
    }

    const cachedManifest = await this.readManifest(media);
    if (cachedManifest?.status === "completed" && cachedManifest.pages.length > 0) {
      return cachedManifest.pages.map((path) => pageFileName(path));
    }

    if (!cachedManifest) {
      await this.writeManifest(media, {
        status: "pending",
        pages: [],
        updatedAt: new Date().toISOString()
      });
    }

    await this.writeManifest(media, {
      status: "processing",
      pages: [],
      updatedAt: new Date().toISOString()
    });

    try {
      const sourceUrl = await this.generateSignedSourceUrl(media.storagePath);
      const conversionId = await this.startConversionWithRotation(sourceUrl);
      const outputUrls = await this.pollConvertio(conversionId);
      const buffers = await this.downloadImageBuffers(outputUrls);
      const pages = await this.uploadPages(media, buffers);

      await this.writeManifest(media, {
        status: "completed",
        pages,
        updatedAt: new Date().toISOString()
      });

      return pages.map((path) => pageFileName(path));
    } catch (error) {
      await this.writeManifest(media, {
        status: "failed",
        pages: [],
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown conversion failure"
      });
      throw error;
    }
  }

  async openPageStream(
    media: Pick<MediaFile, "id" | "updatedAt" | "storagePath" | "filename" | "mimeType" | "extension">,
    fileName: string
  ): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    const pages = await this.ensureOfficePagePreview(media);
    if (!pages.includes(fileName)) {
      throw new HttpError(404, "Office preview page not found", {
        code: "OFFICE_PREVIEW_PAGE_NOT_FOUND"
      });
    }

    const filePath = `${previewBasePath(media)}/${fileName}`;
    const stream = await storage.get(filePath);
    return {
      stream,
      contentType: fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"
    };
  }
}
