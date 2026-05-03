import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extname } from "node:path";
import { HttpError } from "../../utils/http-error.js";
import { MediaRepository } from "./repository.js";
import { OfficePreviewService } from "./office-preview.service.js";
import { PptxSlidePreviewService } from "./pptx-slide-preview.service.js";
import { PdfPagePreviewService } from "./pdf-page-preview.service.js";

const mediaRepository = new MediaRepository();
const officePreviewService = new OfficePreviewService();
const pptxSlidePreviewService = new PptxSlidePreviewService();
const pdfPagePreviewService = new PdfPagePreviewService();

function normalizedExtension(fileName: string, extension?: string | null): string {
  const fromName = extname(fileName || "").replace(".", "").toLowerCase();
  if (fromName) {
    return fromName;
  }

  return (extension || "").toLowerCase();
}

function isOfficeConvertible(mimeType: string, extension: string): boolean {
  const normalizedMime = mimeType.toLowerCase();

  if (
    normalizedMime.includes("application/msword") ||
    normalizedMime.includes("application/vnd.ms-") ||
    normalizedMime.includes("application/vnd.openxmlformats-officedocument") ||
    normalizedMime.includes("application/vnd.oasis.opendocument")
  ) {
    return true;
  }

  if (normalizedMime.startsWith("text/")) {
    return extension === "txt" || extension === "html" || extension === "htm";
  }

  return ["doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "ods", "odp", "txt", "html", "htm"].includes(extension);
}

function isPptFamily(mimeType: string, extension: string): boolean {
  const normalizedMime = mimeType.toLowerCase();
  if (
    normalizedMime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    normalizedMime === "application/vnd.ms-powerpoint"
  ) {
    return true;
  }

  return extension === "ppt" || extension === "pptx";
}

function isPdf(mimeType: string, extension: string): boolean {
  return mimeType.toLowerCase() === "application/pdf" || extension === "pdf";
}

async function drainReadable(readable: NodeJS.ReadableStream): Promise<void> {
  await pipeline(
    readable,
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    })
  );
}

export class DocumentConversionService {
  async processMedia(mediaId: string): Promise<{
    mediaId: string;
    generatedPdf: boolean;
    generatedSlides: number;
    generatedPdfPages: number;
  }> {
    const media = await mediaRepository.findById(mediaId);
    if (!media) {
      throw new HttpError(404, "Media not found");
    }

    const extension = normalizedExtension(media.filename, media.extension);
    const mimeType = media.mimeType || "application/octet-stream";

    let generatedPdf = false;
    let generatedSlides = 0;
    let generatedPdfPages = 0;

    if (isOfficeConvertible(mimeType, extension)) {
      const pdfStream = await officePreviewService.ensurePdfPreview(media);
      await drainReadable(pdfStream);
      generatedPdf = true;
    }

    if (isPptFamily(mimeType, extension)) {
      const slides = await pptxSlidePreviewService.ensureSlidePreview(media);
      generatedSlides = slides.length;
    }

    if (isPdf(mimeType, extension)) {
      const pages = await pdfPagePreviewService.ensurePagePreview(media);
      generatedPdfPages = pages.length;
    }

    return {
      mediaId,
      generatedPdf,
      generatedSlides,
      generatedPdfPages
    };
  }
}
