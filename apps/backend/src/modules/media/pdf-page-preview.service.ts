import { createReadStream, createWriteStream, existsSync, promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import type { MediaFile } from "@prisma/client";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { HttpError } from "../../utils/http-error.js";

const execFileAsync = promisify(execFile);
const storage = new LocalStorageProvider();
const PREVIEW_ROOT_DIR = resolve(tmpdir(), "linkforge-pdf-page-preview");
const PDF_TO_IMAGE_TIMEOUT_MS = 120_000;

type PdfPagePreviewManifest = {
  pages: string[];
};

function isPdfFile(media: Pick<MediaFile, "mimeType" | "filename" | "extension">): boolean {
  const mime = media.mimeType.toLowerCase();
  if (mime === "application/pdf") {
    return true;
  }

  const extension = (media.extension || extname(media.filename).replace(".", "")).toLowerCase();
  return extension === "pdf";
}

function buildCacheDir(media: Pick<MediaFile, "id" | "updatedAt">): string {
  return join(PREVIEW_ROOT_DIR, media.id, String(media.updatedAt.getTime()));
}

function manifestPath(cacheDir: string): string {
  return join(cacheDir, "manifest.json");
}

function sanitizePageFileName(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toPageMimeType(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

export class PdfPagePreviewService {
  private async readManifest(cacheDir: string): Promise<PdfPagePreviewManifest | null> {
    const filePath = manifestPath(cacheDir);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as PdfPagePreviewManifest;
      if (!Array.isArray(parsed.pages)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private async writeManifest(cacheDir: string, manifest: PdfPagePreviewManifest): Promise<void> {
    await fs.writeFile(manifestPath(cacheDir), JSON.stringify(manifest), "utf8");
  }

  private async renderPagesToCache(media: Pick<MediaFile, "storagePath">, cacheDir: string): Promise<string[]> {
    const sourcePdfPath = join(cacheDir, "source.pdf");
    if (!existsSync(sourcePdfPath)) {
      const sourceStream = await storage.get(media.storagePath);
      await pipeline(sourceStream, createWriteStream(sourcePdfPath));
    }

    const existingFiles = await fs.readdir(cacheDir).catch(() => []);
    await Promise.all(
      existingFiles
        .filter((entry) => entry.startsWith("raw-page-") || /^page-\d+\.png$/i.test(entry))
        .map((entry) => fs.rm(join(cacheDir, entry), { force: true }))
    );

    const renderedPrefix = join(cacheDir, "raw-page");
    await execFileAsync("pdftoppm", ["-png", "-r", "150", sourcePdfPath, renderedPrefix], {
      timeout: PDF_TO_IMAGE_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024
    });

    const outputFiles = await fs.readdir(cacheDir);
    const rawPages = outputFiles
      .filter((entry) => /^raw-page-\d+\.png$/i.test(entry))
      .sort((a, b) => {
        const aNumber = Number.parseInt(a.replace(/\D+/g, ""), 10) || 0;
        const bNumber = Number.parseInt(b.replace(/\D+/g, ""), 10) || 0;
        return aNumber - bNumber;
      });

    if (rawPages.length === 0) {
      throw new HttpError(500, "No PDF pages were rendered", {
        code: "PDF_PAGE_RENDER_EMPTY"
      });
    }

    const normalizedPages: string[] = [];
    for (let index = 0; index < rawPages.length; index += 1) {
      const sourceName = rawPages[index];
      const targetName = sanitizePageFileName(`page-${String(index + 1).padStart(3, "0")}.png`);
      await fs.rename(join(cacheDir, sourceName), join(cacheDir, targetName));
      normalizedPages.push(targetName);
    }

    return normalizedPages;
  }

  async ensurePagePreview(media: Pick<MediaFile, "id" | "updatedAt" | "storagePath" | "filename" | "mimeType" | "extension">): Promise<string[]> {
    if (!isPdfFile(media)) {
      throw new HttpError(400, "PDF page preview is not supported for this file type");
    }

    const cacheDir = buildCacheDir(media);
    await fs.mkdir(cacheDir, { recursive: true });

    const existingManifest = await this.readManifest(cacheDir);
    if (existingManifest) {
      return existingManifest.pages;
    }

    const pages = await this.renderPagesToCache(media, cacheDir);
    await this.writeManifest(cacheDir, { pages });
    return pages;
  }

  async openPageStream(
    media: Pick<MediaFile, "id" | "updatedAt" | "storagePath" | "filename" | "mimeType" | "extension">,
    pageFileName: string
  ): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    const pages = await this.ensurePagePreview(media);
    const normalizedName = sanitizePageFileName(pageFileName);
    if (!pages.includes(normalizedName)) {
      throw new HttpError(404, "Page preview not found", {
        code: "PDF_PAGE_NOT_FOUND"
      });
    }

    const cacheDir = buildCacheDir(media);
    const filePath = join(cacheDir, normalizedName);
    if (!existsSync(filePath)) {
      throw new HttpError(404, "Page preview not found", {
        code: "PDF_PAGE_NOT_FOUND"
      });
    }

    return {
      stream: createReadStream(filePath),
      contentType: toPageMimeType(normalizedName)
    };
  }
}
