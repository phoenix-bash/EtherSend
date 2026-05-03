import { createReadStream, createWriteStream, existsSync, promises as fs } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import type { MediaFile } from "@prisma/client";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { HttpError } from "../../utils/http-error.js";

const execFileAsync = promisify(execFile);
const storage = new LocalStorageProvider();
const PREVIEW_ROOT_DIR = resolve(tmpdir(), "linkforge-pptx-preview");
const OFFICE_BINARY_CANDIDATES = ["soffice", "libreoffice"] as const;
const OFFICE_PREVIEW_TIMEOUT_MS = 90_000;
const PDF_TO_IMAGE_TIMEOUT_MS = 120_000;

type PptxPreviewManifest = {
  slides: string[];
};

function isPptxFile(media: Pick<MediaFile, "mimeType" | "filename" | "extension">): boolean {
  const mime = media.mimeType.toLowerCase();
  if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint"
  ) {
    return true;
  }

  const extension = (media.extension || extname(media.filename).replace(".", "")).toLowerCase();
  return extension === "pptx" || extension === "ppt";
}

function buildCacheDir(media: Pick<MediaFile, "id" | "updatedAt">): string {
  return join(PREVIEW_ROOT_DIR, media.id, String(media.updatedAt.getTime()));
}

function manifestPath(cacheDir: string): string {
  return join(cacheDir, "manifest.json");
}

function sanitizeSlideFileName(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function safeFileStem(fileName: string): string {
  const stem = basename(fileName, extname(fileName)).trim();
  if (!stem) {
    return "presentation";
  }

  return stem.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function resolveInputExtension(media: Pick<MediaFile, "filename" | "extension">): string {
  const fromName = extname(media.filename || "").replace(".", "").toLowerCase();
  if (fromName) {
    return fromName;
  }

  const fromMedia = (media.extension || "").trim().toLowerCase();
  return fromMedia || "pptx";
}

async function resolveGeneratedPdfPath(cacheDir: string, preferredPath: string): Promise<string | null> {
  if (existsSync(preferredPath)) {
    return preferredPath;
  }

  const candidates = await fs.readdir(cacheDir).catch(() => []);
  const pdfFile = candidates.find((entry) => entry.toLowerCase().endsWith(".pdf"));
  if (!pdfFile) {
    return null;
  }

  return join(cacheDir, pdfFile);
}

function toSlideMimeType(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  return "application/octet-stream";
}

export class PptxSlidePreviewService {
  private async readManifest(cacheDir: string): Promise<PptxPreviewManifest | null> {
    const filePath = manifestPath(cacheDir);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as PptxPreviewManifest;
      if (!Array.isArray(parsed.slides)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private async writeManifest(cacheDir: string, manifest: PptxPreviewManifest): Promise<void> {
    await fs.writeFile(manifestPath(cacheDir), JSON.stringify(manifest), "utf8");
  }

  private async convertToPdf(
    media: Pick<MediaFile, "storagePath" | "filename" | "extension">,
    cacheDir: string
  ): Promise<string> {
    const sourcePath = join(cacheDir, `${safeFileStem(media.filename)}.${resolveInputExtension(media)}`);
    const outputPdfPath = join(cacheDir, `${safeFileStem(media.filename)}.pdf`);

    if (!existsSync(outputPdfPath)) {
      const sourceStream = await storage.get(media.storagePath);
      await pipeline(sourceStream, createWriteStream(sourcePath));
    }

    if (!existsSync(outputPdfPath)) {
      let conversionError: unknown = null;
      for (const binary of OFFICE_BINARY_CANDIDATES) {
        try {
          await execFileAsync(
            binary,
            ["--headless", "--nologo", "--nolockcheck", "--nodefault", "--norestore", "--convert-to", "pdf", "--outdir", cacheDir, sourcePath],
            {
              timeout: OFFICE_PREVIEW_TIMEOUT_MS,
              maxBuffer: 10 * 1024 * 1024
            }
          );
          conversionError = null;
          break;
        } catch (error) {
          conversionError = error;
        }
      }

      if (conversionError) {
        throw new HttpError(500, "Failed to convert PPTX to PDF", {
          code: "PPTX_PDF_CONVERSION_FAILED"
        });
      }
    }

    const resolvedPdfPath = await resolveGeneratedPdfPath(cacheDir, outputPdfPath);
    if (!resolvedPdfPath) {
      throw new HttpError(500, "Generated PPTX preview PDF was not found", {
        code: "PPTX_PDF_NOT_FOUND"
      });
    }

    return resolvedPdfPath;
  }

  private async renderSlidesToCache(
    media: Pick<MediaFile, "storagePath" | "filename" | "extension">,
    cacheDir: string
  ): Promise<string[]> {
    const pdfPath = await this.convertToPdf(media, cacheDir);
    const renderedPrefix = join(cacheDir, "raw-slide");

    const existingFiles = await fs.readdir(cacheDir).catch(() => []);
    await Promise.all(
      existingFiles
        .filter((entry) => entry.startsWith("raw-slide-") || /^slide-\d+\.png$/i.test(entry))
        .map((entry) => fs.rm(join(cacheDir, entry), { force: true }))
    );

    await execFileAsync("pdftoppm", ["-png", "-r", "150", pdfPath, renderedPrefix], {
      timeout: PDF_TO_IMAGE_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024
    });

    const outputFiles = await fs.readdir(cacheDir);
    const rawSlides = outputFiles
      .filter((entry) => /^raw-slide-\d+\.png$/i.test(entry))
      .sort((a, b) => {
        const aNumber = Number.parseInt(a.replace(/\D+/g, ""), 10) || 0;
        const bNumber = Number.parseInt(b.replace(/\D+/g, ""), 10) || 0;
        return aNumber - bNumber;
      });

    if (rawSlides.length === 0) {
      throw new HttpError(500, "No PPTX slides were rendered", {
        code: "PPTX_SLIDE_RENDER_EMPTY"
      });
    }

    const normalizedSlides: string[] = [];
    for (let index = 0; index < rawSlides.length; index += 1) {
      const sourceName = rawSlides[index];
      const targetName = sanitizeSlideFileName(`slide-${String(index + 1).padStart(3, "0")}.png`);
      await fs.rename(join(cacheDir, sourceName), join(cacheDir, targetName));
      normalizedSlides.push(targetName);
    }

    return normalizedSlides;
  }

  async ensureSlidePreview(media: Pick<MediaFile, "id" | "updatedAt" | "storagePath" | "filename" | "mimeType" | "extension">): Promise<string[]> {
    if (!isPptxFile(media)) {
      throw new HttpError(400, "Slide preview is not supported for this file type");
    }

    const cacheDir = buildCacheDir(media);
    await fs.mkdir(cacheDir, { recursive: true });

    const existingManifest = await this.readManifest(cacheDir);
    if (existingManifest) {
      return existingManifest.slides;
    }

    const slides = await this.renderSlidesToCache(media, cacheDir);
    await this.writeManifest(cacheDir, { slides });
    return slides;
  }

  async openSlideStream(
    media: Pick<MediaFile, "id" | "updatedAt" | "storagePath" | "filename" | "mimeType" | "extension">,
    slideFileName: string
  ): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    const slides = await this.ensureSlidePreview(media);
    const normalizedName = sanitizeSlideFileName(slideFileName);
    if (!slides.includes(normalizedName)) {
      throw new HttpError(404, "Slide not found");
    }

    const filePath = join(buildCacheDir(media), normalizedName);
    if (!existsSync(filePath)) {
      throw new HttpError(404, "Slide not found");
    }

    return {
      stream: createReadStream(filePath),
      contentType: toSlideMimeType(normalizedName)
    };
  }
}
