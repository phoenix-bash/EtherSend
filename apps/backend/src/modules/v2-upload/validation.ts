import { z } from "zod";

export const uploadInitBodySchema = z.object({
  fileName: z.string().trim().min(1).max(512),
  fileSize: z.number().int().positive(),
  mimeType: z.string().trim().min(1).max(127),
  userId: z.string().trim().min(1).max(255).optional()
});

export const uploadCompleteBodySchema = z.object({
  uploadId: z.string().trim().min(1).max(255).nullable().optional(),
  key: z.string().trim().min(1),
  fileId: z.string().trim().min(1),
  parts: z
    .array(
      z.object({
        PartNumber: z.number().int().min(1),
        ETag: z.string().trim().min(1)
      })
    )
    .optional()
});

export const uploadAbortBodySchema = z.object({
  uploadId: z.string().trim().min(1).max(255),
  key: z.string().trim().min(1)
});

export const uploadChunkBodySchema = z.object({
  uploadId: z.string().trim().min(1).max(255),
  partNumber: z.number().int().min(1),
  key: z.string().trim().min(1)
});

export function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
}

export function sanitizeFileName(fileName: string): string {
  const sanitized = sanitizePathSegment(fileName);
  return sanitized || "file";
}

export function resolveAllowedMimePatterns(rawValue: string): string[] {
  return rawValue
    .split(",")
    .map((pattern) => pattern.trim().toLowerCase())
    .filter((pattern) => pattern.length > 0);
}

export function isMimeTypeAllowed(mimeType: string, allowedPatterns: string[]): boolean {
  if (allowedPatterns.length === 0 || allowedPatterns.includes("*/*")) {
    return true;
  }

  const normalizedMimeType = mimeType.toLowerCase();

  return allowedPatterns.some((pattern) => {
    if (pattern === normalizedMimeType) {
      return true;
    }

    if (pattern.endsWith("/*")) {
      const category = pattern.slice(0, pattern.length - 1);
      return normalizedMimeType.startsWith(category);
    }

    return false;
  });
}
