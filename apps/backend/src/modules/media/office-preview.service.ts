import { createReadStream, createWriteStream, existsSync, promises as fs } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MediaFile } from "@prisma/client";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { HttpError } from "../../utils/http-error.js";

const execFileAsync = promisify(execFile);
const storage = new LocalStorageProvider();
const OFFICE_PREVIEW_TIMEOUT_MS = 90_000;
const OFFICE_BINARY_CANDIDATES = ["soffice", "libreoffice"] as const;

function safeFileStem(fileName: string): string {
  const stem = basename(fileName, extname(fileName)).trim();
  if (!stem) {
    return "document";
  }

  return stem.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function resolveInputExtension(media: Pick<MediaFile, "filename" | "extension" | "mimeType">): string {
  const fromName = extname(media.filename || "").replace(".", "").toLowerCase();
  if (fromName) {
    return fromName;
  }

  const fromMedia = (media.extension || "").trim().toLowerCase();
  if (fromMedia) {
    return fromMedia;
  }

  const mime = (media.mimeType || "").toLowerCase();
  if (mime.includes("presentationml") || mime.includes("powerpoint") || mime.includes("presentation")) {
    return "pptx";
  }

  if (mime.includes("wordprocessingml") || mime.includes("msword") || mime.includes("word")) {
    return "docx";
  }

  if (mime.includes("spreadsheetml") || mime.includes("excel") || mime.includes("spreadsheet")) {
    return "xlsx";
  }

  if (mime === "application/vnd.oasis.opendocument.text") {
    return "odt";
  }

  if (mime === "application/vnd.oasis.opendocument.spreadsheet") {
    return "ods";
  }

  if (mime === "application/vnd.oasis.opendocument.presentation") {
    return "odp";
  }

  if (mime === "text/html") {
    return "html";
  }

  if (mime === "text/plain") {
    return "txt";
  }

  return "txt";
}

function buildCachePaths(media: Pick<MediaFile, "id" | "filename" | "extension" | "mimeType" | "updatedAt">): {
  cacheDir: string;
  sourcePath: string;
  outputPath: string;
} {
  const rootDir = resolve(tmpdir(), "linkforge-office-preview");
  const versionKey = String(media.updatedAt.getTime());
  const cacheDir = join(rootDir, media.id, versionKey);
  const sourcePath = join(cacheDir, `${safeFileStem(media.filename)}.${resolveInputExtension(media)}`);
  const outputPath = join(cacheDir, `${safeFileStem(media.filename)}.pdf`);

  return { cacheDir, sourcePath, outputPath };
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

export class OfficePreviewService {
  private isOfficeFile(media: Pick<MediaFile, "mimeType" | "filename" | "extension">): boolean {
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
    return ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pps", "ppsx", "odt", "ods", "odp", "txt", "html", "htm"].includes(extension);
  }

  async ensurePdfPreview(media: Pick<MediaFile, "id" | "filename" | "extension" | "mimeType" | "storagePath" | "updatedAt">): Promise<NodeJS.ReadableStream> {
    if (!this.isOfficeFile(media)) {
      throw new HttpError(400, "Office preview is not supported for this file type");
    }

    const { cacheDir, sourcePath, outputPath } = buildCachePaths(media);

    if (existsSync(outputPath)) {
      return createReadStream(outputPath);
    }

    await fs.mkdir(cacheDir, { recursive: true });

    const sourceStream = await storage.get(media.storagePath);
    await pipeline(sourceStream, createWriteStream(sourcePath));

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
      throw new HttpError(500, "Failed to generate Office preview PDF", {
        code: "OFFICE_PREVIEW_CONVERSION_FAILED"
      });
    }

    const resolvedPdfPath = await resolveGeneratedPdfPath(cacheDir, outputPath);
    if (!resolvedPdfPath) {
      throw new HttpError(500, "Generated Office preview PDF was not found");
    }

    return createReadStream(resolvedPdfPath);
  }
}
